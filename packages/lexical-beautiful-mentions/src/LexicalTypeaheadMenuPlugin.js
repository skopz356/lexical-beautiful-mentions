import { jsx as _jsx } from "react/jsx-runtime";
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import { $getSelection, $isRangeSelection, $isTextNode, COMMAND_PRIORITY_LOW, createCommand, KEY_ARROW_DOWN_COMMAND, KEY_ARROW_UP_COMMAND, KEY_ENTER_COMMAND, KEY_ESCAPE_COMMAND, KEY_TAB_COMMAND, } from "lexical";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, } from "react";
export class TypeaheadOption {
    constructor(key) {
        this.key = key;
        this.ref = { current: null };
        this.setRefElement = this.setRefElement.bind(this);
    }
    setRefElement(element) {
        this.ref = { current: element };
    }
}
const scrollIntoViewIfNeeded = (target) => {
    const typeaheadContainerNode = document.getElementById("typeahead-menu");
    if (!typeaheadContainerNode)
        return;
    const typeaheadRect = typeaheadContainerNode.getBoundingClientRect();
    if (typeaheadRect.top + typeaheadRect.height > window.innerHeight) {
        typeaheadContainerNode.scrollIntoView({
            block: "center",
        });
    }
    if (typeaheadRect.top < 0) {
        typeaheadContainerNode.scrollIntoView({
            block: "center",
        });
    }
    target.scrollIntoView({ block: "nearest" });
};
function getTextUpToAnchor(selection) {
    const anchor = selection.anchor;
    if (anchor.type !== "text") {
        return null;
    }
    const anchorNode = anchor.getNode();
    if (!anchorNode.isSimpleText()) {
        return null;
    }
    const anchorOffset = anchor.offset;
    return anchorNode.getTextContent().slice(0, anchorOffset);
}
function tryToPositionRange(leadOffset, range) {
    const domSelection = window.getSelection();
    if (domSelection === null || !domSelection.isCollapsed) {
        return false;
    }
    const anchorNode = domSelection.anchorNode;
    const startOffset = leadOffset;
    const endOffset = domSelection.anchorOffset;
    if (anchorNode == null || endOffset == null) {
        return false;
    }
    try {
        range.setStart(anchorNode, startOffset);
        range.setEnd(anchorNode, endOffset);
    }
    catch (error) {
        return false;
    }
    return true;
}
function getQueryTextForSearch(editor) {
    let text = null;
    editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
            return;
        }
        text = getTextUpToAnchor(selection);
    });
    return text;
}
/**
 * Walk backwards along user input and forward through entity title to try
 * and replace more of the user's text with entity.
 */
function getFullMatchOffset(documentText, entryText, offset) {
    let triggerOffset = offset;
    for (let i = triggerOffset; i <= entryText.length; i++) {
        if (documentText.substr(-i) === entryText.substr(0, i)) {
            triggerOffset = i;
        }
    }
    return triggerOffset;
}
/**
 * Split Lexical TextNode and return a new TextNode only containing matched text.
 * Common use cases include: removing the node, replacing with a new node.
 */
function splitNodeContainingQuery(editor, match) {
    const selection = $getSelection();
    if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
        return null;
    }
    const anchor = selection.anchor;
    if (anchor.type !== "text") {
        return null;
    }
    const anchorNode = anchor.getNode();
    if (!anchorNode.isSimpleText()) {
        return null;
    }
    const selectionOffset = anchor.offset;
    const textContent = anchorNode.getTextContent().slice(0, selectionOffset);
    const characterOffset = match.replaceableString.length;
    const queryOffset = getFullMatchOffset(textContent, match.matchingString, characterOffset);
    const startOffset = selectionOffset - queryOffset;
    if (startOffset < 0) {
        return null;
    }
    let newNode;
    if (startOffset === 0) {
        [newNode] = anchorNode.splitText(selectionOffset);
    }
    else {
        [, newNode] = anchorNode.splitText(startOffset, selectionOffset);
    }
    return newNode;
}
function isSelectionOnEntityBoundary(editor, offset) {
    if (offset !== 0) {
        return false;
    }
    return editor.getEditorState().read(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
            const anchor = selection.anchor;
            const anchorNode = anchor.getNode();
            const prevSibling = anchorNode.getPreviousSibling();
            return $isTextNode(prevSibling) && prevSibling.isTextEntity();
        }
        return false;
    });
}
function startTransition(callback) {
    if (React.startTransition) {
        React.startTransition(callback);
    }
    else {
        callback();
    }
}
// Got from https://stackoverflow.com/a/42543908/2013580
export function getScrollParent(element, includeHidden) {
    let style = getComputedStyle(element);
    const excludeStaticParent = style.position === "absolute";
    const overflowRegex = includeHidden
        ? /(auto|scroll|hidden)/
        : /(auto|scroll)/;
    if (style.position === "fixed") {
        return document.body;
    }
    for (let parent = element; (parent = parent.parentElement);) {
        style = getComputedStyle(parent);
        if (excludeStaticParent && style.position === "static") {
            continue;
        }
        if (overflowRegex.test(style.overflow + style.overflowY + style.overflowX)) {
            return parent;
        }
    }
    return document.body;
}
function isTriggerVisibleInNearestScrollContainer(targetElement, containerElement) {
    const tRect = targetElement.getBoundingClientRect();
    const cRect = containerElement.getBoundingClientRect();
    return tRect.top > cRect.top && tRect.top < cRect.bottom;
}
// Reposition the menu on scroll, window resize, and element resize.
export function useDynamicPositioning(resolution, targetElement, onReposition, onVisibilityChange) {
    const [editor] = useLexicalComposerContext();
    useEffect(() => {
        if (targetElement != null && resolution != null) {
            const rootElement = editor.getRootElement();
            const rootScrollParent = rootElement != null
                ? getScrollParent(rootElement, false)
                : document.body;
            let ticking = false;
            let previousIsInView = isTriggerVisibleInNearestScrollContainer(targetElement, rootScrollParent);
            const handleScroll = function () {
                if (!ticking) {
                    window.requestAnimationFrame(function () {
                        onReposition();
                        ticking = false;
                    });
                    ticking = true;
                }
                const isInView = isTriggerVisibleInNearestScrollContainer(targetElement, rootScrollParent);
                if (isInView !== previousIsInView) {
                    previousIsInView = isInView;
                    if (onVisibilityChange != null) {
                        onVisibilityChange(isInView);
                    }
                }
            };
            const resizeObserver = new ResizeObserver(onReposition);
            window.addEventListener("resize", onReposition);
            document.addEventListener("scroll", handleScroll, {
                capture: true,
                passive: true,
            });
            resizeObserver.observe(targetElement);
            return () => {
                resizeObserver.unobserve(targetElement);
                window.removeEventListener("resize", onReposition);
                document.removeEventListener("scroll", handleScroll);
            };
        }
    }, [targetElement, editor, onVisibilityChange, onReposition, resolution]);
}
export const SCROLL_TYPEAHEAD_OPTION_INTO_VIEW_COMMAND = createCommand("SCROLL_TYPEAHEAD_OPTION_INTO_VIEW_COMMAND");
function LexicalPopoverMenu({ close, editor, anchorElementRef, resolution, options, menuRenderFn, onSelectOption, onMenuVisibilityChange, }) {
    const [menuVisible, setMenuVisible] = useState(false);
    const [selectedIndex, setHighlightedIndex] = useState(null);
    useEffect(() => {
        setHighlightedIndex(0);
    }, [resolution.match.matchingString]);
    const selectOptionAndCleanUp = useCallback((selectedEntry) => {
        editor.update(() => {
            const textNodeContainingQuery = splitNodeContainingQuery(editor, resolution.match);
            onSelectOption(selectedEntry, textNodeContainingQuery, close, resolution.match.matchingString);
        });
    }, [close, editor, resolution.match, onSelectOption]);
    const updateSelectedIndex = useCallback((index) => {
        const rootElem = editor.getRootElement();
        if (rootElem !== null) {
            rootElem.setAttribute("aria-activedescendant", "typeahead-item-" + index);
            setHighlightedIndex(index);
        }
    }, [editor]);
    useEffect(() => {
        return () => {
            const rootElem = editor.getRootElement();
            if (rootElem !== null) {
                rootElem.removeAttribute("aria-activedescendant");
            }
        };
    }, [editor]);
    useLayoutEffect(() => {
        if (options === null) {
            setHighlightedIndex(null);
        }
        else if (selectedIndex === null) {
            updateSelectedIndex(0);
        }
    }, [options, selectedIndex, updateSelectedIndex]);
    useEffect(() => {
        return mergeRegister(editor.registerCommand(SCROLL_TYPEAHEAD_OPTION_INTO_VIEW_COMMAND, ({ option }) => {
            if (option.ref && option.ref.current != null) {
                scrollIntoViewIfNeeded(option.ref.current);
                return true;
            }
            return false;
        }, COMMAND_PRIORITY_LOW));
    }, [editor, updateSelectedIndex]);
    useEffect(() => {
        return mergeRegister(editor.registerCommand(KEY_ARROW_DOWN_COMMAND, (payload) => {
            const event = payload;
            if (options !== null && options.length && selectedIndex !== null) {
                const newSelectedIndex = selectedIndex !== options.length - 1 ? selectedIndex + 1 : 0;
                updateSelectedIndex(newSelectedIndex);
                const option = options[newSelectedIndex];
                if (option.ref != null && option.ref.current) {
                    editor.dispatchCommand(SCROLL_TYPEAHEAD_OPTION_INTO_VIEW_COMMAND, {
                        index: newSelectedIndex,
                        option,
                    });
                }
                event.preventDefault();
                event.stopImmediatePropagation();
            }
            return true;
        }, COMMAND_PRIORITY_LOW), editor.registerCommand(KEY_ARROW_UP_COMMAND, (payload) => {
            const event = payload;
            if (options !== null && options.length && selectedIndex !== null) {
                const newSelectedIndex = selectedIndex !== 0 ? selectedIndex - 1 : options.length - 1;
                updateSelectedIndex(newSelectedIndex);
                const option = options[newSelectedIndex];
                if (option.ref != null && option.ref.current) {
                    scrollIntoViewIfNeeded(option.ref.current);
                }
                event.preventDefault();
                event.stopImmediatePropagation();
            }
            return true;
        }, COMMAND_PRIORITY_LOW), editor.registerCommand(KEY_ESCAPE_COMMAND, (payload) => {
            const event = payload;
            event.preventDefault();
            event.stopImmediatePropagation();
            close();
            return true;
        }, COMMAND_PRIORITY_LOW), editor.registerCommand(KEY_TAB_COMMAND, (payload) => {
            const event = payload;
            if (options === null ||
                selectedIndex === null ||
                options[selectedIndex] == null) {
                return false;
            }
            event.preventDefault();
            event.stopImmediatePropagation();
            selectOptionAndCleanUp(options[selectedIndex]);
            return true;
        }, COMMAND_PRIORITY_LOW), editor.registerCommand(KEY_ENTER_COMMAND, (event) => {
            if (options === null ||
                selectedIndex === null ||
                options[selectedIndex] == null) {
                return false;
            }
            if (event !== null) {
                event.preventDefault();
                event.stopImmediatePropagation();
            }
            selectOptionAndCleanUp(options[selectedIndex]);
            return true;
        }, COMMAND_PRIORITY_LOW));
    }, [
        selectOptionAndCleanUp,
        close,
        editor,
        options,
        selectedIndex,
        updateSelectedIndex,
    ]);
    const listItemProps = useMemo(() => ({
        options,
        selectOptionAndCleanUp,
        selectedIndex,
        setHighlightedIndex,
    }), [selectOptionAndCleanUp, selectedIndex, options]);
    const menu = menuRenderFn(anchorElementRef, listItemProps, resolution.match.matchingString);
    useLayoutEffect(() => {
        if (onMenuVisibilityChange && menu !== null && !menuVisible) {
            onMenuVisibilityChange(true);
            setMenuVisible(true);
        }
        else if (onMenuVisibilityChange && menu === null && menuVisible) {
            onMenuVisibilityChange(false);
            setMenuVisible(false);
        }
    }, [menu, menuVisible, onMenuVisibilityChange]);
    return menu;
}
function useMenuAnchorRef(opt) {
    const { resolution, setResolution, className, menuVisible } = opt;
    const [editor] = useLexicalComposerContext();
    const anchorElementRef = useRef(document.createElement("div"));
    const positionMenu = useCallback(() => {
        const rootElement = editor.getRootElement();
        const containerDiv = anchorElementRef.current;
        const menuEle = containerDiv.firstChild;
        if (rootElement !== null && resolution !== null) {
            const { left, top, height } = resolution.getRect();
            containerDiv.style.top = `${top + window.pageYOffset}px`;
            containerDiv.style.left = `${left + window.pageXOffset}px`;
            containerDiv.style.height = `${height}px`;
            if (menuEle !== null) {
                const menuRect = menuEle.getBoundingClientRect();
                const menuHeight = menuRect.height;
                const menuWidth = menuRect.width;
                const rootElementRect = rootElement.getBoundingClientRect();
                if (left + menuWidth > rootElementRect.right) {
                    containerDiv.style.left = `${rootElementRect.right - menuWidth + window.pageXOffset}px`;
                }
                const margin = 10;
                if ((top + menuHeight > window.innerHeight ||
                    top + menuHeight > rootElementRect.bottom) &&
                    top - rootElementRect.top > menuHeight) {
                    containerDiv.style.top = `${top - menuHeight + window.pageYOffset - (height + margin)}px`;
                }
            }
            if (!containerDiv.isConnected) {
                if (className) {
                    containerDiv.className = className;
                }
                containerDiv.setAttribute("aria-label", "Typeahead menu");
                containerDiv.setAttribute("id", "typeahead-menu");
                containerDiv.setAttribute("role", "listbox");
                containerDiv.style.display = "block";
                containerDiv.style.position = "absolute";
                document.body.append(containerDiv);
            }
            anchorElementRef.current = containerDiv;
            rootElement.setAttribute("aria-controls", "typeahead-menu");
        }
    }, [editor, resolution, className]);
    useEffect(() => {
        const rootElement = editor.getRootElement();
        if (resolution !== null && menuVisible) {
            positionMenu();
            return () => {
                if (rootElement !== null) {
                    rootElement.removeAttribute("aria-controls");
                }
                const containerDiv = anchorElementRef.current;
                if (containerDiv !== null && containerDiv.isConnected) {
                    containerDiv.remove();
                }
            };
        }
    }, [editor, positionMenu, resolution, menuVisible]);
    const onVisibilityChange = useCallback((isInView) => {
        if (resolution !== null) {
            if (!isInView) {
                setResolution(null);
            }
        }
    }, [resolution, setResolution]);
    useDynamicPositioning(resolution, anchorElementRef.current, positionMenu, onVisibilityChange);
    return anchorElementRef;
}
export function LexicalTypeaheadMenuPlugin({ options, onQueryChange, onSelectOption, onOpen, onClose, menuRenderFn, triggerFn, anchorClassName, }) {
    const [editor] = useLexicalComposerContext();
    const [resolution, setResolution] = useState(null);
    const [menuVisible, setMenuVisible] = useState(false);
    const anchorElementRef = useMenuAnchorRef({
        resolution,
        setResolution,
        className: anchorClassName,
        menuVisible,
    });
    const closeTypeahead = useCallback(() => {
        setResolution(null);
        if (onClose != null && resolution !== null) {
            onClose();
        }
    }, [onClose, resolution]);
    const openTypeahead = useCallback((res) => {
        setResolution(res);
        if (onOpen != null && resolution === null) {
            onOpen(res);
        }
    }, [onOpen, resolution]);
    useEffect(() => {
        if (resolution === null && menuVisible) {
            setMenuVisible(false);
        }
        const updateListener = () => {
            editor.getEditorState().read(() => {
                const range = document.createRange();
                const selection = $getSelection();
                const text = getQueryTextForSearch(editor);
                if (!$isRangeSelection(selection) ||
                    !selection.isCollapsed() ||
                    text === null ||
                    range === null) {
                    closeTypeahead();
                    return;
                }
                const match = triggerFn(text, editor);
                onQueryChange(match ? match.matchingString : null);
                if (match !== null &&
                    !isSelectionOnEntityBoundary(editor, match.leadOffset)) {
                    const isRangePositioned = tryToPositionRange(match.leadOffset, range);
                    if (isRangePositioned !== null) {
                        startTransition(() => openTypeahead({
                            getRect: () => range.getBoundingClientRect(),
                            match,
                        }));
                        return;
                    }
                }
                closeTypeahead();
            });
        };
        const removeUpdateListener = editor.registerUpdateListener(updateListener);
        return () => {
            removeUpdateListener();
        };
    }, [
        editor,
        triggerFn,
        onQueryChange,
        resolution,
        closeTypeahead,
        openTypeahead,
        menuVisible,
        setMenuVisible,
    ]);
    return resolution === null || editor === null ? null : (_jsx(LexicalPopoverMenu, { close: closeTypeahead, resolution: resolution, editor: editor, anchorElementRef: anchorElementRef, options: options, menuRenderFn: menuRenderFn, onSelectOption: onSelectOption, onMenuVisibilityChange: setMenuVisible }));
}
