type SplitAxis = "horizontal" | "vertical";

function setupSplitter(
    divider: HTMLElement,
    container: HTMLElement,
    leadingPane: HTMLElement,
    axis: SplitAxis,
    minLeadingSize: number,
    minTrailingSize: number
) {
    const paneSize = (pane: HTMLElement) => {
        const bounds = pane.getBoundingClientRect();
        return axis === "horizontal" ? bounds.width : bounds.height;
    };

    const totalSize = () => axis === "horizontal" ? container.clientWidth : container.clientHeight;
    const dividerSize = () => {
        const bounds = divider.getBoundingClientRect();
        return axis === "horizontal" ? bounds.width : bounds.height;
    };
    const maximumLeadingSize = () => totalSize() - dividerSize() - minTrailingSize;
    const clampSize = (size: number) => Math.min(
        Math.max(size, minLeadingSize),
        Math.max(minLeadingSize, maximumLeadingSize())
    );
    const updateAriaValue = () => {
        divider.setAttribute("aria-valuemin", String(minLeadingSize));
        divider.setAttribute("aria-valuemax", String(Math.max(minLeadingSize, maximumLeadingSize())));
        divider.setAttribute("aria-valuenow", String(Math.round(paneSize(leadingPane))));
    };
    const setLeadingSize = (size: number) => {
        leadingPane.style.flex = `0 0 ${clampSize(size)}px`;
        updateAriaValue();
    };

    divider.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        divider.setPointerCapture(event.pointerId);
    });

    divider.addEventListener("pointermove", (event) => {
        if (!divider.hasPointerCapture(event.pointerId)) return;

        const bounds = container.getBoundingClientRect();
        const position = axis === "horizontal"
            ? event.clientX - bounds.left
            : event.clientY - bounds.top;
        setLeadingSize(position - dividerSize() / 2);
    });

    divider.addEventListener("keydown", (event) => {
        const decrementKey = axis === "horizontal" ? "ArrowLeft" : "ArrowUp";
        const incrementKey = axis === "horizontal" ? "ArrowRight" : "ArrowDown";

        if (event.key === decrementKey) {
            setLeadingSize(paneSize(leadingPane) - 24);
        } else if (event.key === incrementKey) {
            setLeadingSize(paneSize(leadingPane) + 24);
        } else if (event.key === "Home") {
            setLeadingSize(minLeadingSize);
        } else if (event.key === "End") {
            setLeadingSize(maximumLeadingSize());
        } else {
            return;
        }

        event.preventDefault();
    });

    window.addEventListener("resize", () => setLeadingSize(paneSize(leadingPane)));
    updateAriaValue();
}

export function setupResizableLayout() {
    setupSplitter(
        document.getElementById("editorPreviewDivider")!,
        document.getElementById("app")!,
        document.getElementById("rete")!,
        "horizontal",
        140,
        220
    );

    setupSplitter(
        document.getElementById("previewPanelDivider")!,
        document.getElementById("mainWorkspace")!,
        document.getElementById("canvasPane")!,
        "vertical",
        120,
        80
    );
}
