export function tooltip(element: HTMLElement) {
    let comp: HTMLDivElement | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    function mouseEnter(event: MouseEvent) {
        if (event.target !== element) return;

        const tooltip_message = element.getAttribute('tooltip');
        if (tooltip_message == null || tooltip_message == '') return;

        comp = document.createElement('div');

        const rect = element.getBoundingClientRect();
        const estimated_width = 150;
        const estimated_height = 30;
        const screen_width = document.body.offsetWidth;
        const screen_height = document.body.offsetHeight;

        if (rect.y + rect.height > screen_height - estimated_height) {
            comp.style.bottom = `${String(rect.height + 15)}px`;
        } else {
            comp.style.top = `${String(rect.y + rect.height + 10)}px`;
        }

        if (rect.x + rect.width > screen_width - estimated_width) {
            comp.style.right = `${String(20)}px`;
        } else {
            comp.style.left = `${String(rect.x)}px`;
        }

        comp.style.maxWidth = '150px';
        comp.style.pointerEvents = 'none';
        comp.style.position = 'absolute';
        comp.style.zIndex = '999';
        comp.style.backgroundColor = '#ece8cf';
        comp.style.boxShadow =
            '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)';
        comp.style.overflow = 'hidden';
        comp.style.padding = '4px';
        comp.style.fontFamily = 'MSSS';
        comp.innerHTML = `
			<p class=" line-clamp-1 leading-tight text-ellipsis" style="font-size:11px;">
				${tooltip_message}
			</p>`;

        timeout = setTimeout(() => {
            if (comp != null) {
                document.body.appendChild(comp);
            }
            setTimeout(() => {
                comp?.remove();
            }, 3000);
        }, 2000);
    }

    function mouseLeave() {
        clearTimeout(timeout);
        if (comp != null) {
            comp.remove();
        }
    }

    element.addEventListener('mouseenter', mouseEnter);
    element.addEventListener('mouseleave', mouseLeave);

    return {
        destroy() {
            element.removeEventListener('mouseenter', mouseEnter);
            element.removeEventListener('mouseleave', mouseLeave);
        },
    };
}
