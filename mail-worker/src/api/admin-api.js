import { and, desc, eq, sql } from 'drizzle-orm';

import app from '../hono/hono';
import result from '../model/result';
import orm from '../entity/orm';
import account from '../entity/account';
import email from '../entity/email';
import userService from '../service/user-service';
import accountService from '../service/account-service';
import roleService from '../service/role-service';
import adminAuthUtils from '../utils/admin-auth-utils';
import emailUtils from '../utils/email-utils';
import { emailConst, isDel } from '../const/entity-const';

function randomPart(length = 6) {
	const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
	let output = '';
	for (let i = 0; i < length; i += 1) {
		output += chars[Math.floor(Math.random() * chars.length)];
	}
	return output;
}

function toBool(value, defaultValue = false) {
	if (typeof value === 'boolean') return value;
	if (typeof value === 'string') {
		const normalized = value.trim().toLowerCase();
		if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
		if (['false', '0', 'no', 'off'].includes(normalized)) return false;
	}
	return defaultValue;
}

app.post('/admin/new_address', async (c) => {
	adminAuthUtils.verifyAdminAuth(c);

	const payload = await c.req.json();
	const enablePrefix = toBool(payload.enablePrefix, true);
	const requestedName = String(payload.name || '').trim().toLowerCase();
	const requestedDomain = String(payload.domain || '').trim().toLowerCase();
	const password = String(payload.password || randomPart(16));

	if (!requestedDomain) {
		return c.json(result.fail('Email domain is required', 400));
	}

	const localPart = requestedName || randomPart(10);
	if (!enablePrefix && !requestedName) {
		return c.json(result.fail('Email name is required when prefix is disabled', 400));
	}

	const finalLocalPart = enablePrefix ? localPart : requestedName;
	const finalEmail = `${finalLocalPart}@${requestedDomain}`;

	if (!emailUtils.isAllowedDomain(requestedDomain, c.env.domain)) {
		return c.json(result.fail('Email domain does not exist', 400));
	}

	const adminUser = await userService.selectByEmailIncludeDel(c, c.env.admin);
	if (!adminUser || adminUser.isDel === isDel.DELETE) {
		return c.json(result.fail('Admin user does not exist', 500));
	}

	const existing = await accountService.selectByEmailIncludeDel(c, finalEmail);
	if (existing && existing.isDel !== isDel.DELETE) {
		return c.json(result.fail('Email already exists', 409));
	}

	if (existing && existing.isDel === isDel.DELETE) {
		await accountService.restoreByEmail(c, finalEmail);
		const restored = await accountService.selectByEmailIncludeDel(c, finalEmail);
		return c.json(result.ok({
			id: restored?.accountId,
			address_id: restored?.accountId,
			address: finalEmail,
			email: finalEmail,
			jwt: '',
		}));
	}

	const adminRole = await roleService.selectByUserId(c, adminUser.userId);
	if (adminRole?.availDomain && !roleService.hasAvailDomainPerm(adminRole.availDomain, finalEmail)) {
		return c.json(result.fail('No permission for this email domain', 403));
	}

	await accountService.insert(c, {
		email: finalEmail,
		name: emailUtils.getName(finalEmail),
		userId: adminUser.userId,
	});

	const created = await accountService.selectByEmailIncludeDel(c, finalEmail);

	return c.json(result.ok({
		id: created?.accountId,
		address_id: created?.accountId,
		address: finalEmail,
		email: finalEmail,
		jwt: '',
		password,
	}));
});

app.get('/admin/mails', async (c) => {
	adminAuthUtils.verifyAdminAuth(c);

	const address = String(c.req.query('address') || '').trim().toLowerCase();
	const limit = Math.min(Math.max(Number(c.req.query('limit') || 50), 1), 100);
	const offset = Math.max(Number(c.req.query('offset') || 0), 0);

	let accountRow = null;
	if (address) {
		accountRow = await accountService.selectByEmailIncludeDel(c, address);
		if (!accountRow || accountRow.isDel === isDel.DELETE) {
			return c.json(result.ok({ results: [] }));
		}
	}

	const conditions = [
		eq(email.type, emailConst.type.RECEIVE),
		eq(email.isDel, isDel.NORMAL),
	];
	if (accountRow) {
		conditions.push(eq(email.accountId, accountRow.accountId));
	} else if (address) {
		conditions.push(sql`${email.toEmail} COLLATE NOCASE = ${address}`);
	}

	const rows = await orm(c)
		.select({
			id: email.emailId,
			accountId: email.accountId,
			address: email.toEmail,
			source: email.sendEmail,
			from: email.sendEmail,
			subject: email.subject,
			text: email.text,
			content: email.content,
			raw: email.text,
			createdAt: email.createTime,
		})
		.from(email)
		.where(and(...conditions))
		.orderBy(desc(email.emailId))
		.limit(limit)
		.offset(offset)
		.all();

	return c.json(result.ok({ results: rows }));
});
