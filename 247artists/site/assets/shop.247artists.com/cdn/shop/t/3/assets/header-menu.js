import { Component } from "@theme/component";
import { debounce, onDocumentLoaded } from "@theme/utilities";
import { MegaMenuHoverEvent } from "@theme/events";
const ACTIVATE_DELAY = 0,
  DEACTIVATE_DELAY = 350;
class HeaderMenu extends Component {
  requiredRefs = ["overflowMenu"];
  #abortController = new AbortController();
  connectedCallback() {
    (super.connectedCallback(),
      this.overflowMenu?.addEventListener("pointerleave", () => this.#debouncedDeactivate(), {
        signal: this.#abortController.signal,
      }),
      onDocumentLoaded(this.#preloadImages));
  }
  disconnectedCallback() {
    (super.disconnectedCallback(),
      this.#abortController.abort(),
      this.#outsideClickController &&
        (this.#outsideClickController.abort(), (this.#outsideClickController = null)));
  }
  #state = { activeItem: null };
  get animationDelay() {
    const value = this.dataset.animationDelay;
    return value ? parseInt(value, 10) : 0;
  }
  get overflowMenu() {
    return this.refs.overflowMenu?.shadowRoot?.querySelector('[part="overflow"]');
  }
  get overflowHovered() {
    return this.refs.overflowMenu?.matches(":hover") ?? !1;
  }
  activate = (event) => {
    (("ontouchstart" in window || navigator.maxTouchPoints > 0) &&
      (event.type === "pointerenter" || event.type === "focus")) ||
      (this.#debouncedDeactivate.cancel(),
      this.#debouncedActivateHandler.cancel(),
      this.#debouncedActivateHandler(event));
  };
  #activateHandler = (event) => {
    if (
      (this.#debouncedDeactivate.cancel(),
      this.dispatchEvent(new MegaMenuHoverEvent()),
      this.removeAttribute("data-animating"),
      !(event.target instanceof Element))
    )
      return;
    let item = findMenuItem(event.target);
    if (!item || item == this.#state.activeItem) return;
    const isDefaultSlot = event.target.slot === "";
    this.dataset.overflowExpanded = (!isDefaultSlot).toString();
    const previouslyActiveItem = this.#state.activeItem;
    (previouslyActiveItem && (previouslyActiveItem.ariaExpanded = "false"),
      (this.#state.activeItem = item),
      (this.ariaExpanded = "true"),
      (item.ariaExpanded = "true"));
    let submenu = findSubmenu(item),
      overflowMenuHeight = this.overflowMenu?.offsetHeight ?? 0;
    !submenu && !isDefaultSlot && (submenu = this.overflowMenu);
    const submenuHeight = submenu ? Math.max(submenu.offsetHeight, overflowMenuHeight) : 0;
    (this.style.setProperty("--submenu-height", `${submenuHeight}px`),
      this.style.setProperty("--submenu-opacity", "1"),
      ("ontouchstart" in window || navigator.maxTouchPoints > 0) &&
        (this.#outsideClickController && this.#outsideClickController.abort(),
        (this.#outsideClickController = new AbortController()),
        setTimeout(() => {
          this.#outsideClickController &&
            document.addEventListener("click", this.#handleOutsideClick, {
              signal: this.#outsideClickController.signal,
              capture: !0,
            });
        }, 0)));
  };
  #debouncedActivateHandler = debounce(this.#activateHandler, ACTIVATE_DELAY);
  deactivate(event) {
    if ((this.#debouncedActivateHandler.cancel(), !(event.target instanceof Element))) return;
    findMenuItem(event.target) === this.#state.activeItem && this.#debouncedDeactivate();
  }
  #deactivate = (item = this.#state.activeItem, force = !1) => {
    !item ||
      item != this.#state.activeItem ||
      (!force && this.overflowHovered) ||
      (force &&
        (this.refs.overflowMenu?.blur(),
        document.activeElement instanceof HTMLElement && document.activeElement.blur()),
      this.#outsideClickController &&
        (this.#outsideClickController.abort(), (this.#outsideClickController = null)),
      this.style.setProperty("--submenu-height", "0px"),
      this.style.setProperty("--submenu-opacity", "0"),
      (this.dataset.overflowExpanded = "false"),
      (this.#state.activeItem = null),
      (this.ariaExpanded = "false"),
      (item.ariaExpanded = "false"),
      item.setAttribute("data-animating", ""),
      setTimeout(
        () => {
          item.removeAttribute("data-animating");
        },
        Math.max(0, this.animationDelay - 150),
      ));
  };
  #debouncedDeactivate = debounce(this.#deactivate, DEACTIVATE_DELAY);
  handleTouchStart = (event) => {
    if (!(event.target instanceof Element)) return;
    const menuItem = findMenuItem(event.target);
    if (!menuItem) return;
    const hasSubmenu = menuItem.getAttribute("aria-haspopup") === "true",
      isMoreButton = event.target.slot === "more";
    (hasSubmenu || isMoreButton) &&
      (menuItem !== this.#state.activeItem
        ? (event.preventDefault(), this.activate(event))
        : event.target.slot !== "overflow" &&
          (event.preventDefault(), this.#deactivate(this.#state.activeItem, !0)));
  };
  #handleOutsideClick = (event) => {
    if (!(event.target instanceof Element)) return;
    const clickedInsideMenu = this.contains(event.target),
      clickedInsideOverflow =
        this.overflowMenu?.contains(event.target) || this.refs.overflowMenu?.contains(event.target);
    let clickedInsideSubmenu = !1;
    if (this.#state.activeItem) {
      const activeSubmenu = findSubmenu(this.#state.activeItem);
      activeSubmenu && (clickedInsideSubmenu = activeSubmenu.contains(event.target));
    }
    !clickedInsideMenu &&
      !clickedInsideOverflow &&
      !clickedInsideSubmenu &&
      this.#deactivate(this.#state.activeItem, !0);
  };
  #outsideClickController = null;
  #preloadImages = () => {
    this.querySelectorAll('img[loading="lazy"]')?.forEach((image) =>
      image.removeAttribute("loading"),
    );
  };
}
customElements.get("header-menu") || customElements.define("header-menu", HeaderMenu);
function findMenuItem(element) {
  return element instanceof Element
    ? element?.matches('[slot="more"')
      ? findMenuItem(element.parentElement?.querySelector('[slot="overflow"]'))
      : element?.querySelector('[ref="menuitem"]')
    : null;
}
function findSubmenu(element) {
  const submenu = element?.parentElement?.querySelector('[ref="submenu[]"]');
  return submenu instanceof HTMLElement ? submenu : null;
}
//# sourceMappingURL=/cdn/shop/t/3/assets/header-menu.js.map?v=40019208165771922371754935552
