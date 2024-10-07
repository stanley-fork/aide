/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64 } from '../../../../base/common/buffer.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import Severity from '../../../../base/common/severity.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { CSAuthenticationSession, CSUserProfileResponse, EncodedCSTokenData, ICSAuthenticationService } from '../../../../platform/codestoryAccount/common/csAccount.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { INotificationService, NotificationPriority } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { ISecretStorageService } from '../../../../platform/secrets/common/secrets.js';
import { IThemeService, Themable } from '../../../../platform/theme/common/themeService.js';
import { IURLService } from '../../../../platform/url/common/url.js';

const SESSION_SECRET_KEY = 'codestory.auth.session';

export class CSAuthenticationService extends Themable implements ICSAuthenticationService {
	declare readonly _serviceBrand: undefined;

	private _onDidAuthenticate: Emitter<CSAuthenticationSession> = this._register(new Emitter<CSAuthenticationSession>());
	readonly onDidAuthenticate: Event<CSAuthenticationSession> = this._onDidAuthenticate.event;

	private _subscriptionsAPIBase: string | null = null;
	private _websiteBase: string | null = null;

	private _pendingStates: string[] = [];
	private _session: CSAuthenticationSession | undefined;

	constructor(
		@IThemeService themeService: IThemeService,
		@ISecretStorageService private readonly secretStorageService: ISecretStorageService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IProgressService private readonly progressService: IProgressService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IURLService private readonly urlService: IURLService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super(themeService);

		const isDevelopment = !this.environmentService.isBuilt || this.environmentService.isExtensionDevelopment;
		if (isDevelopment) {
			this._subscriptionsAPIBase = 'https://staging-api.codestory.ai';
			this._websiteBase = 'https://staging.aide.dev';
		} else {
			this._subscriptionsAPIBase = 'https://api.codestory.ai';
			this._websiteBase = 'https://aide.dev';
		}

		CommandsRegistry.registerCommand('codestory.refreshTokens', async () => {
			await this.refreshTokens();
		});

		this.urlService.create({ path: '/authenticate-codestory' });
		this.initialize();
	}

	private async initialize(): Promise<void> {
		const session = await this.secretStorageService.get(SESSION_SECRET_KEY);
		this._session = session ? JSON.parse(session) : undefined;
		await this.refreshTokens();
	}

	async refreshTokens(): Promise<void> {
		if (!this._session) {
			return;
		}

		try {
			const response = await fetch(`${this._subscriptionsAPIBase}/v1/auth/refresh`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					'refresh_token': this._session.refreshToken,
				}),
			});
			if (!response.ok) {
				this.notificationService.notify(
					{
						severity: Severity.Error,
						message: `Failed to authenticate with CodeStory. Please try logging in again.`,
						priority: NotificationPriority.URGENT,
					}
				);
				await this.deleteSession();
				throw new Error(`Failed to authenticate with CodeStory. Please try logging in again.`);
			}
			const data = (await response.json()) as EncodedCSTokenData;
			const resp = await fetch(
				`${this._subscriptionsAPIBase}/v1/users/me`,
				{
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${data.access_token}`,
					},
				},
			);
			const text = await resp.text();
			const userProfile = JSON.parse(text) as CSUserProfileResponse;
			const newSession: CSAuthenticationSession = {
				id: this._session.id,
				accessToken: data.access_token,
				refreshToken: data.refresh_token,
				account: userProfile.user,
				waitlistPosition: userProfile.waitlistPosition,
			};
			await this.setSession(newSession);
		} catch (e: any) {
			return;
		}
	}

	async createSession(): Promise<CSAuthenticationSession> {
		try {
			const encodedTokenData = await this.login();
			if (!encodedTokenData) {
				throw new Error(`CodeStory login failure`);
			}

			const userInfo = (await this.getUserInfo(encodedTokenData));
			const { user, access_token, refresh_token, waitlistPosition } = userInfo;
			if (waitlistPosition > 0) {
				this.notifyWaitlistPosition(waitlistPosition);
			}

			const session: CSAuthenticationSession = {
				id: generateUuid(),
				accessToken: access_token,
				refreshToken: refresh_token,
				account: user,
				waitlistPosition,
			};
			this._onDidAuthenticate.fire(session);
			await this.setSession(session);

			return session;
		} catch (e) {
			throw e;
		}
	}

	private async setSession(session: CSAuthenticationSession) {
		this._session = session;
		await this.secretStorageService.set(SESSION_SECRET_KEY, JSON.stringify(session));
	}

	async deleteSession(): Promise<void> {
		await this.secretStorageService.delete(SESSION_SECRET_KEY);
	}

	private async login() {
		const cts = new CancellationTokenSource();
		return await this.progressService.withProgress<string>(
			{
				location: ProgressLocation.Notification,
				title: 'Signing in to CodeStory...',
				cancellable: true,
			},
			async () => {
				const stateId = generateUuid();
				this._pendingStates.push(stateId);

				const url = `${this._websiteBase}/authenticate?state=${stateId}`;
				await this.openerService.open(url);

				try {
					// Use the built-in VSCode API for handling cancellation
					const timeoutPromise = new Promise<string>((_, reject) =>
						setTimeout(() => reject('Cancelled'), 60000)
					);
					const cancellationPromise = new Promise<string>((_, reject) => {
						const cancellationListener = cts.token.onCancellationRequested(() => {
							cancellationListener.dispose();
							reject('User Cancelled');
						});
					});

					const loginPromise = new Promise<string>((resolve, reject) => {
						const disposable = this.urlService.registerHandler({
							handleURL: async (uri: URI): Promise<boolean> => {
								try {
									const tokenData = await this.handleUri(uri);
									resolve(tokenData);
									disposable.dispose();
									return true;
								} catch (e) {
									reject(e);
									return false;
								}
							},
						});
					});

					const result = await Promise.race([
						loginPromise,
						timeoutPromise,
						cancellationPromise
					]);

					return result;
				} finally {
					this._pendingStates = this._pendingStates.filter(n => n !== stateId);
				}
			},
			() => cts.cancel()
		);
	}

	private async handleUri(uri: URI): Promise<string> {
		const query = new URLSearchParams(uri.query);
		const encodedData = query.get('data');
		if (!encodedData) {
			return '';
		}

		return encodedData;
	}

	async getSession(): Promise<CSAuthenticationSession | undefined> {
		const session = await this.secretStorageService.get(SESSION_SECRET_KEY);
		return session ? JSON.parse(session) : undefined;
	}

	/**
	 * Get the user info from WorkOS
	 * @param encodedTokenData
	 * @returns
	 **/
	private async getUserInfo(encodedTokenData: string) {
		// Reverse the base64 encoding
		const tokenData = decodeBase64(encodedTokenData);
		const tokens = JSON.parse(tokenData.toString()) as EncodedCSTokenData;

		const resp = await fetch(
			`${this._subscriptionsAPIBase}/v1/users/me`,
			{
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${tokens.access_token}`,
				},
			},
		);
		const text = await resp.text();
		const data = JSON.parse(text) as CSUserProfileResponse;
		return { ...data, ...tokens };
	}

	notifyWaitlistPosition(position?: number) {
		this.notificationService.notify(
			{
				severity: Severity.Error,
				message: `You are currently on the CodeStory waitlist ${position ? `at position ${position}` : ''}.
Having a waitlist is currently the best way for us to sustainably manage the growth of our platform and resolving issues
with a smaller group of users before opening up to more users. We will send you an email soon as we are ready for you!
In the meantime, you can continue using the editor just like VSCode as they are fully compatible with each other.`,
				priority: NotificationPriority.URGENT,
			}
		);
	}
}

registerSingleton(ICSAuthenticationService, CSAuthenticationService, InstantiationType.Eager);