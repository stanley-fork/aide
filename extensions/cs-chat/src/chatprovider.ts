/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';

import logger from './logger';

class CSChatSessionState implements vscode.InteractiveSessionState {
}

class CSChatParticipant implements vscode.InteractiveSessionParticipantInformation {
	name: string;
	icon?: vscode.Uri | undefined;

	constructor(name: string, icon?: vscode.Uri | undefined) {
		this.name = name;
		this.icon = icon;
	}

	toString(): string {
		return `CSChatParticipant { name: "${this.name}", icon: "${this.icon?.toString()}" }`;
	}
}

class CSChatSession implements vscode.InteractiveSession {
	requester: CSChatParticipant;
	responder: CSChatParticipant;
	inputPlaceholder?: string | undefined;

	constructor(requester: CSChatParticipant, responder: CSChatParticipant, inputPlaceholder?: string | undefined) {
		this.requester = requester;
		this.responder = responder;
		this.inputPlaceholder = inputPlaceholder;
	}

	toString(): string {
		return `CSChatSession { requester: ${this.requester.toString()}, responder: ${this.responder.toString()}, inputPlaceholder: "${this.inputPlaceholder}" }`;
	}
}

class CSChatRequestArgs implements vscode.InteractiveSessionRequestArgs {
	command: string;
	args: any;

	constructor(command: string, args: any) {
		this.command = command;
		this.args = args;
	}

	toString(): string {
		return `CSChatRequestArgs { command: "${this.command}", args: ${JSON.stringify(this.args, null, 2)} }`;
	}
}

class CSChatReplyFollowup implements vscode.InteractiveSessionReplyFollowup {
	message: string;
	tooltip?: string | undefined;
	title?: string | undefined;
	metadata?: any;

	constructor(message: string, tooltip?: string | undefined, title?: string | undefined, metadata?: any) {
		this.message = message;
		this.tooltip = tooltip;
		this.title = title;
		this.metadata = metadata;
	}

	toString(): string {
		return `CSChatReplyFollowup { message: "${this.message}", tooltip: "${this.tooltip}", title: "${this.title}", metadata: ${JSON.stringify(this.metadata, null, 2)} }`;
	}
}

class CSChatRequest implements vscode.InteractiveRequest {
	session: CSChatSession;
	message: string | CSChatReplyFollowup;

	constructor(session: CSChatSession, message: string | CSChatReplyFollowup) {
		this.session = session;
		this.message = message;
	}

	toString(): string {
		return `CSChatRequest { session: ${this.session.toString()}, message: ${this.message.toString()} }`;
	}
}

class CSChatResponseErrorDetails implements vscode.InteractiveResponseErrorDetails {
	message: string;
	responseIsIncomplete?: boolean | undefined;
	responseIsFiltered?: boolean | undefined;

	constructor(message: string, responseIsIncomplete?: boolean | undefined, responseIsFiltered?: boolean | undefined) {
		this.message = message;
		this.responseIsIncomplete = responseIsIncomplete;
		this.responseIsFiltered = responseIsFiltered;
	}

	toString(): string {
		return `CSChatResponseErrorDetails { message: "${this.message}", responseIsIncomplete: "${this.responseIsIncomplete}", responseIsFiltered: "${this.responseIsFiltered}" }`;
	}
}

class CSChatProgressContent implements vscode.InteractiveProgressContent {
	content: string;

	constructor(content: string) {
		this.content = content;
	}

	toString(): string {
		return `CSChatProgressContent { content: "${this.content}" }`;
	}
}

class CSChatProgressId implements vscode.InteractiveProgressId {
	responseId: string;

	constructor(responseId: string) {
		this.responseId = responseId;
	}

	toString(): string {
		return `CSChatProgressId { responseId: "${this.responseId}" }`;
	}
}

class CSChatFileTreeData implements vscode.FileTreeData {
	label: string;
	uri: vscode.Uri;
	children?: vscode.FileTreeData[] | undefined;

	constructor(label: string, uri: vscode.Uri, children?: vscode.FileTreeData[] | undefined) {
		this.label = label;
		this.uri = uri;
		this.children = children;
	}

	toString(): string {
		return `CSChatFileTreeData { label: "${this.label}", uri: "${this.uri}", children: ${JSON.stringify(this.children, null, 2)} }`;
	}
}

class CSChatProgressFileTree implements vscode.InteractiveProgressFileTree {
	treeData: CSChatFileTreeData;

	constructor(treeData: CSChatFileTreeData) {
		this.treeData = treeData;
	}

	toString(): string {
		return `CSChatProgressFileTree { treeData: "${this.treeData}" }`;
	}
}

class CSChatProgressTask implements vscode.InteractiveProgressTask {
	placeholder: string;
	resolvedContent: Thenable<CSChatProgressContent | CSChatProgressFileTree>;

	constructor(placeholder: string, resolvedContent: Thenable<CSChatProgressContent | CSChatProgressFileTree>) {
		this.placeholder = placeholder;
		this.resolvedContent = resolvedContent;
	}

	toString(): string {
		return `CSChatProgressTask { placeholder: "${this.placeholder}", resolvedContent: "${this.resolvedContent}" }`;
	}
}

type CSChatProgress = CSChatProgressContent | CSChatProgressId | CSChatProgressTask | CSChatProgressFileTree;

class CSChatResponseForProgress implements vscode.InteractiveResponseForProgress {
	errorDetails?: CSChatResponseErrorDetails | undefined;

	constructor(errorDetails?: CSChatResponseErrorDetails | undefined) {
		this.errorDetails = errorDetails;
	}

	toString(): string {
		return `CSChatResponseForProgress { errorDetails: ${this.errorDetails?.toString()} }`;
	}
}

class CSChatCancellationToken implements vscode.CancellationToken {
	isCancellationRequested: boolean;
	onCancellationRequested: vscode.Event<any>;

	constructor(isCancellationRequested: boolean, onCancellationRequested: vscode.Event<any>) {
		this.isCancellationRequested = isCancellationRequested;
		this.onCancellationRequested = onCancellationRequested;
	}

	toString(): string {
		return `CSChatCancellationToken { isCancellationRequested: "${this.isCancellationRequested}", onCancellationRequested: "${this.onCancellationRequested}" }`;
	}
}

export class CSChatProvider implements vscode.InteractiveSessionProvider {
	prepareSession(initialState: CSChatSessionState | undefined, token: CSChatCancellationToken): vscode.ProviderResult<CSChatSession> {
		logger.info('prepareSession', initialState, token);
		return new CSChatSession(
			new CSChatParticipant('Requester'),
			new CSChatParticipant('Responder'),
			'Ask CodeStory a question or type \'/\' for topics?'
		);
	}

	resolveRequest(session: CSChatSession, context: CSChatRequestArgs | string, token: CSChatCancellationToken): vscode.ProviderResult<CSChatRequest> {
		logger.info('resolveRequest', session, context, token);
		return new CSChatRequest(session, context.toString());
	}

	provideResponseWithProgress(request: CSChatRequest, progress: vscode.Progress<CSChatProgress>, token: CSChatCancellationToken): vscode.ProviderResult<CSChatResponseForProgress> {
		logger.info('provideResponseWithProgres', request, progress, token);
		progress.report(new CSChatProgressContent('Hello there!'));
		return new CSChatResponseForProgress();
	}

	removeRequest(session: CSChatSession, requestId: string) {
		logger.info('removeRequest', session, requestId);
		// Do nothing
	}
}