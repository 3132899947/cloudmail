import { parseHTML } from 'linkedom';

const emailUtils = {

	getDomain(email) {
		if (typeof email !== 'string') return '';
		const parts = email.split('@');
		return parts.length === 2 ? parts[1] : '';
	},

	normalizeDomainList(domainList) {
		if (!domainList) return [];
		if (typeof domainList === 'string') {
			try {
				domainList = JSON.parse(domainList);
			} catch (e) {
				domainList = [domainList];
			}
		}
		if (!Array.isArray(domainList)) {
			domainList = [domainList];
		}
		return domainList
			.map((item) => String(item || '').trim().toLowerCase().replace(/^@/, ''))
			.filter(Boolean);
	},

	isAllowedDomain(domain, domainList) {
		const target = String(domain || '').trim().toLowerCase().replace(/^@/, '');
		if (!target) return false;
		const normalized = this.normalizeDomainList(domainList);
		return normalized.some((base) => target === base || target.endsWith(`.${base}`));
	},

	getName(email) {
		if (typeof email !== 'string') return '';
		const parts = email.trim().split('@');
		return parts.length === 2 ? parts[0] : '';
	},

	htmlToText(content) {
		if (!content) return ''
		try {
			const { document } = parseHTML(content);
			document.querySelectorAll('style, script, title').forEach(el => el.remove());
			let text = document.body.innerText;
			return text.trim();
		} catch (e) {
			console.error(e)
			return ''
		}
	}
};

export default emailUtils;
