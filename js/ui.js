export function element(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(options).forEach(([key, value]) => {
    if (value == null) return;
    if (key === "className") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key === "style") Object.assign(node.style, value);
    else if (key in node && !key.startsWith("aria")) node[key] = value;
    else node.setAttribute(key, value);
  });
  const values = Array.isArray(children) ? children : [children];
  values.filter((child) => child != null).forEach((child) => node.append(child.nodeType ? child : document.createTextNode(String(child))));
  return node;
}

export function emptyState(message) {
  return element("p", { className: "empty", text: message });
}

export function fillSelect(select, options, selected = "", placeholder = null) {
  select.replaceChildren();
  if (placeholder) select.append(element("option", { value: "", text: placeholder }));
  options.forEach((option) => select.append(element("option", { value: option.value, text: option.label })));
  select.value = selected;
}

export function toast(message, type = "success") {
  const region = document.querySelector("#toast-region");
  const item = element("div", { className: `toast ${type === "error" ? "error" : ""}`, text: message, role: "status" });
  region.replaceChildren(item);
  setTimeout(() => item.remove(), 3300);
}

export function showFieldError(element, message) {
  element.textContent = message;
  element.hidden = !message;
}

export function setButtonIconLabel(button, icon, label) {
  button.replaceChildren(element("span", { text: icon, "aria-hidden": "true" }), document.createTextNode(label));
}
