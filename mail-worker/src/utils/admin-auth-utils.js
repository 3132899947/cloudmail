import BizError from '../error/biz-error';

const ADMIN_HEADER = 'x-admin-auth';

const adminAuthUtils = {
	getAdminSecret(c) {
		return String(c.env.admin_password || c.env.adminPassword || '').trim();
	},

	verifyAdminAuth(c) {
		const expected = this.getAdminSecret(c);
		if (!expected) {
			throw new BizError('admin_password is not configured', 500);
		}

		const provided = String(c.req.header(ADMIN_HEADER) || '').trim();
		if (!provided || provided !== expected) {
			throw new BizError('Invalid admin auth', 401);
		}
	},
};

export default adminAuthUtils;
