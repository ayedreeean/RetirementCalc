// tax-engine.js touches window and document while it loads. The mail worker
// has neither. The stub is only there so the calculator scripts can evaluate.
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
if (typeof globalThis.document === 'undefined') {
    const none = () => null;
    globalThis.document = {
        addEventListener() {},
        removeEventListener() {},
        querySelector: none,
        querySelectorAll() { return []; },
        getElementById: none
    };
}
