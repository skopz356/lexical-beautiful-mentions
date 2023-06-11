import { jsx as _jsx } from "react/jsx-runtime";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { MenuOption as _MenuOption, useBasicTypeaheadTriggerMatch, } from "@lexical/react/LexicalTypeaheadMenuPlugin";
import { mergeRegister } from "@lexical/utils";
import { $createTextNode, $nodesOfType, BLUR_COMMAND, COMMAND_PRIORITY_LOW, KEY_DOWN_COMMAND, KEY_SPACE_COMMAND, } from "lexical";
import React, { useCallback, useMemo, useState } from "react";
import * as ReactDOM from "react-dom";
import { LexicalTypeaheadMenuPlugin } from "./LexicalTypeaheadMenuPlugin";
import { INSERT_MENTION_COMMAND, OPEN_MENTIONS_MENU_COMMAND, REMOVE_MENTIONS_COMMAND, RENAME_MENTIONS_COMMAND, } from "./MentionCommands";
import { $createBeautifulMentionNode, $isBeautifulMentionNode, BeautifulMentionNode, } from "./MentionNode";
import { checkForMentions, getSelectionInfo, insertMention, isWordChar, } from "./mention-utils";
import { useDebounce } from "./useDebounce";
import { useIsFocused } from "./useIsFocused";
import { useMentionLookupService } from "./useMentionLookupService";
// At most, 5 suggestions are shown in the popup.
const SUGGESTION_LIST_LENGTH_LIMIT = 5;
class MenuOption extends _MenuOption {
    constructor(value, label) {
        super(value);
        this.value = value;
        this.label = label !== null && label !== void 0 ? label : value;
    }
}
/**
 * A plugin that adds mentions to the lexical editor.
 */
export function BeautifulMentionsPlugin(props) {
    const { items, onSearch, searchDelay = props.onSearch ? 250 : 0, creatable, allowSpaces = true, insertOnBlur = true, menuComponent: MenuComponent = "ul", menuItemComponent: MenuItemComponent = "li", menuAnchorClassName, } = props;
    const isEditorFocused = useIsFocused();
    const triggers = useMemo(() => props.triggers || Object.keys(items || {}), [props.triggers, items]);
    const [editor] = useLexicalComposerContext();
    const [queryString, setQueryString] = useState(null);
    const debouncedQueryString = useDebounce(queryString, searchDelay);
    const [trigger, setTrigger] = useState(null);
    const { results, loading } = useMentionLookupService(debouncedQueryString, trigger, items, onSearch);
    const checkForSlashTriggerMatch = useBasicTypeaheadTriggerMatch("/", {
        minLength: 0,
    });
    const options = useMemo(() => {
        // Add options from the lookup service
        const opt = results
            .map((result) => new MenuOption(result))
            .slice(0, SUGGESTION_LIST_LENGTH_LIMIT);
        // Add mentions from the editor
        editor.getEditorState().read(() => {
            const mentions = $nodesOfType(BeautifulMentionNode);
            for (const mention of mentions) {
                const mentionName = mention.getValue();
                // only add the mention if it's not already in the list
                if (mention.getTrigger() === trigger &&
                    (debouncedQueryString === null ||
                        mention.getValue().startsWith(debouncedQueryString)) &&
                    opt.every((o) => o.value !== mentionName)) {
                    opt.push(new MenuOption(mentionName, mentionName));
                }
            }
        });
        // Add option to create a new mention
        if (debouncedQueryString &&
            opt.every((o) => o.label !== debouncedQueryString)) {
            const creatableName = typeof creatable === "string"
                ? creatable.replace("{{name}}", debouncedQueryString)
                : typeof creatable === "undefined" || creatable
                    ? `Add "${debouncedQueryString}"`
                    : undefined;
            if (creatableName) {
                opt.push(new MenuOption(debouncedQueryString, creatableName));
            }
        }
        return opt;
    }, [results, creatable, debouncedQueryString, trigger, editor]);
    const open = isEditorFocused && (!!options.length || loading);
    const onSelectOption = useCallback((selectedOption, nodeToReplace, closeMenu) => {
        editor.update(() => {
            if (!trigger) {
                return;
            }
            const mentionNode = $createBeautifulMentionNode(trigger, selectedOption.value);
            if (nodeToReplace) {
                nodeToReplace.replace(mentionNode);
            }
            closeMenu();
        });
    }, [editor, trigger]);
    const checkForMentionMatch = useCallback((text) => {
        // Don't show the menu if the next character is a word character
        const info = getSelectionInfo(triggers);
        if ((info === null || info === void 0 ? void 0 : info.isTextNode) && info.wordCharAfterCursor) {
            return null;
        }
        const slashMatch = checkForSlashTriggerMatch(text, editor);
        if (slashMatch !== null) {
            return null;
        }
        const queryMatch = checkForMentions(text, triggers, allowSpaces);
        if (queryMatch) {
            const trigger = queryMatch.replaceableString.replace(queryMatch.matchingString, "");
            setTrigger(trigger || null);
            if (queryMatch.replaceableString) {
                return queryMatch;
            }
        }
        else {
            setTrigger(null);
        }
        return null;
    }, [checkForSlashTriggerMatch, editor, triggers, allowSpaces]);
    const insertTextAsMention = useCallback(() => {
        const info = getSelectionInfo(triggers);
        if (!info || !info.isTextNode) {
            return false;
        }
        const node = info.node;
        const textContent = node.getTextContent();
        const queryMatch = checkForMentions(textContent, triggers, false);
        if (queryMatch && queryMatch.replaceableString.length > 1) {
            const trigger = triggers.find((trigger) => queryMatch.replaceableString.startsWith(trigger));
            const end = textContent.search(new RegExp(`${queryMatch.replaceableString}\\s?$`));
            if (trigger && end !== -1) {
                const mentionNode = $createBeautifulMentionNode(trigger, queryMatch.matchingString);
                node.setTextContent(textContent.substring(0, end));
                node.insertAfter(mentionNode);
                mentionNode.selectNext();
            }
            return true;
        }
        return false;
    }, [triggers]);
    React.useEffect(() => {
        return mergeRegister(editor.registerCommand(KEY_DOWN_COMMAND, (event) => {
            const { key, metaKey, ctrlKey } = event;
            const simpleKey = key.length === 1;
            const isTrigger = triggers.some((trigger) => key === trigger);
            const wordChar = isWordChar(key, triggers);
            const selectionInfo = getSelectionInfo(triggers);
            if (!simpleKey ||
                (!wordChar && !isTrigger) ||
                !selectionInfo ||
                metaKey ||
                ctrlKey) {
                return false;
            }
            const { node, offset, isTextNode, textContent, prevNode, nextNode, wordCharAfterCursor, cursorAtStartOfNode, cursorAtEndOfNode, } = selectionInfo;
            if (isTextNode &&
                cursorAtStartOfNode &&
                $isBeautifulMentionNode(prevNode)) {
                node.insertBefore($createTextNode(" "));
                return true;
            }
            if (isTextNode &&
                cursorAtEndOfNode &&
                $isBeautifulMentionNode(nextNode)) {
                node.insertAfter($createTextNode(" "));
                return true;
            }
            if (isTextNode && isTrigger && wordCharAfterCursor) {
                const content = textContent.substring(0, offset) +
                    " " +
                    textContent.substring(offset);
                node.setTextContent(content);
                return true;
            }
            if ($isBeautifulMentionNode(node) && nextNode === null) {
                node.insertAfter($createTextNode(" "));
                return true;
            }
            return false;
        }, COMMAND_PRIORITY_LOW), editor.registerCommand(BLUR_COMMAND, () => {
            if (insertOnBlur && creatable) {
                return insertTextAsMention();
            }
            return false;
        }, COMMAND_PRIORITY_LOW), editor.registerCommand(KEY_SPACE_COMMAND, () => {
            if (!allowSpaces && creatable) {
                return insertTextAsMention();
            }
            else {
                return false;
            }
        }, COMMAND_PRIORITY_LOW), editor.registerCommand(INSERT_MENTION_COMMAND, (payload) => {
            if (!isEditorFocused) {
                editor.focus(() => {
                    editor.update(() => {
                        insertMention(triggers, payload.trigger, payload.value);
                    });
                });
                return false;
            }
            else {
                return insertMention(triggers, payload.trigger, payload.value);
            }
        }, COMMAND_PRIORITY_LOW), editor.registerCommand(REMOVE_MENTIONS_COMMAND, (payload) => {
            const mentions = $nodesOfType(BeautifulMentionNode);
            for (const mention of mentions) {
                const sameTrigger = mention.getTrigger() === payload.trigger;
                const sameValue = mention.getValue() === payload.value;
                if (sameTrigger && (sameValue || !payload.value)) {
                    const previous = mention.getPreviousSibling();
                    const next = mention.getNextSibling();
                    mention.remove();
                    // Prevent double spaces
                    if ((previous === null || previous === void 0 ? void 0 : previous.getTextContent().endsWith(" ")) &&
                        (next === null || next === void 0 ? void 0 : next.getTextContent().startsWith(" "))) {
                        previous.setTextContent(previous.getTextContent().slice(0, -1));
                    }
                }
            }
            return true;
        }, COMMAND_PRIORITY_LOW), editor.registerCommand(RENAME_MENTIONS_COMMAND, (payload) => {
            const mentions = $nodesOfType(BeautifulMentionNode);
            for (const mention of mentions) {
                const sameTrigger = mention.getTrigger() === payload.trigger;
                const sameValue = mention.getValue() === payload.value;
                if (sameTrigger && (sameValue || !payload.value)) {
                    mention.setValue(payload.newValue);
                }
            }
            return true;
        }, COMMAND_PRIORITY_LOW), editor.registerCommand(OPEN_MENTIONS_MENU_COMMAND, ({ trigger }) => insertMention(triggers, trigger), COMMAND_PRIORITY_LOW));
    }, [
        editor,
        triggers,
        allowSpaces,
        insertOnBlur,
        creatable,
        isEditorFocused,
        insertTextAsMention,
    ]);
    return (_jsx(LexicalTypeaheadMenuPlugin, { onQueryChange: setQueryString, onSelectOption: onSelectOption, triggerFn: checkForMentionMatch, options: options, anchorClassName: menuAnchorClassName, menuRenderFn: (anchorElementRef, { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }) => anchorElementRef.current
            ? ReactDOM.createPortal(_jsx(MenuComponent, Object.assign({ loading: loading, open: open, role: "list", "aria-label": "Choose a mention", "aria-hidden": !open }, { children: options.map((option, i) => (_jsx(MenuItemComponent, Object.assign({ tabIndex: -1, selected: selectedIndex === i, ref: option.setRefElement, role: "listitem", "aria-selected": selectedIndex === i, "aria-label": `Choose ${option.label}`, onClick: () => {
                        setHighlightedIndex(i);
                        selectOptionAndCleanUp(option);
                    }, onMouseDown: (event) => {
                        event.preventDefault();
                    }, onMouseEnter: () => {
                        setHighlightedIndex(i);
                    } }, { children: option.label }), option.key))) })), anchorElementRef.current)
            : null }));
}
