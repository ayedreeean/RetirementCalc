// Opt-in plan email. The simulation stays in app.js. This file only posts
// the address, the consent flag, and the share link.
(function () {
    const ENDPOINTS = { signup: '/api/signup', unsubscribe: '/api/unsubscribe' };

    function field(form, name) {
        const el = form.elements.namedItem(name);
        return el && 'value' in el ? el.value : '';
    }

    function planUrlFor(form) {
        if (form.getAttribute('data-signup') === 'unsubscribe') return '';
        if (form.dataset.source === 'calculator' && typeof window.getFirecalcShareUrl === 'function') {
            return window.getFirecalcShareUrl();
        }
        return field(form, 'plan_url');
    }

    function setStatus(form, text, isError) {
        const status = form.querySelector('.signup-status');
        if (!status) return;
        status.textContent = text;
        status.classList.toggle('is-error', !!isError);
    }

    async function submitForm(form) {
        const mode = form.getAttribute('data-signup') === 'unsubscribe' ? 'unsubscribe' : 'signup';
        const button = form.querySelector('button[type="submit"]');
        const email = field(form, 'email').trim();
        const consent = form.elements.namedItem('consent');
        if (mode === 'signup' && consent && !consent.checked) {
            setStatus(form, 'Check the box to confirm you want this saved.', true);
            return;
        }
        const body = {
            email: email,
            fc_website: field(form, 'fc_website'),
            return_to: field(form, 'return_to')
        };
        if (mode === 'signup') {
            body.consent = true;
            body.source = form.dataset.source || field(form, 'source');
            body.planUrl = planUrlFor(form);
        } else {
            body.token = field(form, 'token').trim();
        }
        if (button) button.disabled = true;
        setStatus(form, mode === 'signup' ? 'Saving…' : 'Deleting…', false);
        try {
            const response = await fetch(ENDPOINTS[mode], {
                method: 'POST',
                headers: { 'content-type': 'application/json', accept: 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await response.json().catch(() => null);
            const message = data && (data.message || data.error);
            if (response.ok && data && data.ok) setStatus(form, message || 'Saved.', false);
            else setStatus(form, message || 'Could not save that signup. Try again later.', true);
        } catch (err) {
            setStatus(form, 'Could not reach the signup service. The calculator still runs in this browser.', true);
        } finally {
            if (button) button.disabled = false;
        }
    }

    function tokenFromQuery() {
        const params = new URLSearchParams(window.location.search);
        const token = params.get('token') || '';
        if (!/^[a-f0-9]{64}$/i.test(token)) return;
        document.querySelectorAll('form[data-signup="unsubscribe"] input[name="token"]').forEach(input => {
            input.value = token;
        });
        document.querySelectorAll('[data-token-note]').forEach(el => {
            el.hidden = false;
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        tokenFromQuery();
        document.querySelectorAll('form[data-signup]').forEach(form => {
            form.addEventListener('submit', function (event) {
                event.preventDefault();
                submitForm(form);
            });
        });
    });
})();
