/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SingleTextEdit } from '../../../../common/core/textEdit.js';
import { Command } from '../../../../common/languages.js';
import { InlineCompletionItem } from './provideInlineCompletions.js';

export class InlineEdit {
	constructor(
		public readonly edit: SingleTextEdit,
		public readonly isCollapsed: boolean,
		public readonly renderExplicitly: boolean,
		public readonly commands: readonly Command[],
		public readonly inlineCompletion: InlineCompletionItem,
	) { }

	public get range() {
		return this.edit.range;
	}

	public get text() {
		return this.edit.text;
	}

	public equals(other: InlineEdit): boolean {
		return this.edit.equals(other.edit)
			&& this.isCollapsed === other.isCollapsed
			&& this.renderExplicitly === other.renderExplicitly
			&& this.inlineCompletion === other.inlineCompletion;
	}
}