import uuidv4 from 'uuid/v4';
import {
	getTestClient,
	getTestClientForUser,
	createUserToken,
	expectHTTPErrorCode,
	createUsers,
} from './utils';
import chai from 'chai';
const expect = chai.expect;

if (process.env.NODE_ENV !== 'production') {
	require('longjohn');
}

Promise = require('bluebird'); // eslint-disable-line no-global-assign
Promise.config({
	longStackTraces: true,
	warnings: {
		wForgottenReturn: false,
	},
});

describe('Channels - Create', function() {
	const johnID = `john-${uuidv4()}`;

	it('john creates a channel with members', async function() {
		const c = await getTestClientForUser(johnID);
		const channelId = uuidv4();
		const johnChannel = c.channel('messaging', channelId, {
			color: 'green',
			members: [johnID],
		});
		const response = await johnChannel.create();
		expect(response.channel.color).to.equal('green');
		const cid = `messaging:${channelId}`;
		expect(response.channel.cid).to.equal(cid);
		expect(response.channel.members).to.equal(undefined);
		expect(response.members.length).to.equal(1);

		const queryResponse = await c.queryChannels({ cid }, undefined, {
			state: true,
			presence: true,
		});
	});
});

describe('Channels - members', function() {
	const tommasoID = `tommaso-${uuidv4()}`;
	const thierryID = `thierry-${uuidv4()}`;

	const channelGroup = 'messaging';
	const channelId = `test-channels-${uuidv4()}`;
	const tommasoToken = createUserToken(tommasoID);
	const thierryToken = createUserToken(thierryID);

	const tommasoClient = getTestClient();
	const thierryClient = getTestClient();

	let tommasoChannel, thierryChannel;
	const message = { text: 'nice little chat API' };

	const tommasoChannelEventQueue = [];
	const thierryChannelEventQueue = [];
	let tommasoPromise;
	let thierryPromise1;
	let thierryPromise2;

	let tommasoMessageID;

	before(async () => {
		await tommasoClient.setUser({ id: tommasoID }, tommasoToken);
		await thierryClient.setUser({ id: thierryID }, thierryToken);
	});

	it('tommaso creates a new channel', async function() {
		tommasoChannel = tommasoClient.channel(channelGroup, channelId);
		tommasoPromise = new Promise(resolve => {
			tommasoChannel.on(event => {
				tommasoChannelEventQueue.push(event);
				if (tommasoChannelEventQueue.length === 4) {
					resolve();
				}
			});
		});
		await tommasoChannel.watch();
	});

	it(`tommaso tries to create a channel that's too large`, async function() {
		await expectHTTPErrorCode(
			400,
			tommasoClient
				.channel(channelGroup, `big-boy-${uuidv4()}`, {
					stuff: 'x'.repeat(6 * 1024),
				})
				.create(),
		);
	});

	it(`tommaso tries to create a channel with a reserved character`, async function() {
		await expectHTTPErrorCode(
			400,
			tommasoClient.channel(channelGroup, `!${channelId}`).watch(),
		);
	});

	it('thierry tries to join the channel', async function() {
		await expectHTTPErrorCode(
			403,
			thierryClient.channel(channelGroup, channelId).watch(),
		);
	});

	it('tommaso adds thierry as channel member', async function() {
		await tommasoChannel.addMembers([thierryID]);
	});

	it('thierry tries to join the channel', async function() {
		thierryChannel = thierryClient.channel(channelGroup, channelId);
		thierryPromise2 = new Promise(resolve2 => {
			thierryPromise1 = new Promise(resolve1 => {
				thierryChannel.on(event => {
					thierryChannelEventQueue.push(event);
					if (thierryChannelEventQueue.length === 2) {
						resolve1();
					}
					if (thierryChannelEventQueue.length === 4) {
						resolve2();
					}
				});
			});
		});
		await thierryChannel.watch();
	});

	it('tommaso gets an event about Thierry joining', async function() {
		await tommasoPromise;
		let event = tommasoChannelEventQueue.pop();
		expect(event.type).to.eql('user.watching.start');
		expect(event.user.id).to.eql(thierryID);

		event = tommasoChannelEventQueue.pop();
		expect(event.type).to.eql('channel.updated');
		event = tommasoChannelEventQueue.pop();
		expect(event.type).to.eql('member.added');
	});

	it('tommaso posts a message', async function() {
		await tommasoChannel.sendMessage(message);
	});

	it('thierry gets the new message from tommaso', async function() {
		await thierryPromise1;
		const event = thierryChannelEventQueue.pop();
		expect(event.type).to.eql('message.new');
		tommasoMessageID = event.message.id;
	});

	it('thierry tries to update the channel description', async function() {
		await expectHTTPErrorCode(
			403,
			thierryChannel.update({ description: 'taking over this channel now!' }),
		);
	});

	it('tommaso updates the channel description', async function() {
		await tommasoChannel.update({ description: 'taking over this channel now!' });
	});

	it('tommaso updates his own message', async function() {
		await tommasoClient.updateMessage({
			id: tommasoMessageID,
			text: 'I mean, awesome chat',
		});
	});

	it('thierry tries to update tommaso message', async function() {
		await expectHTTPErrorCode(
			403,
			thierryClient.updateMessage({
				id: tommasoMessageID,
				text: 'I mean, awesome chat',
			}),
		);
	});

	it('thierry mutes himself', async function() {
		const response = await thierryChannel.sendMessage({
			text: `/mute @${thierryID}`,
		});
		expect(response.message.type).to.eql('error');
	});

	it('thierry gets promoted', async function() {
		await getTestClient(true).updateUser({ id: thierryID, role: 'admin' });
	});
});

describe('Channels - Members are update correctly', function() {
	const channelId = uuidv4();
	const cid = `messaging:${channelId}`;
	const johnID = `john-${uuidv4()}`;
	const members = [
		{
			id: `member1-${uuidv4()}`,
			role: 'user',
			counter: 0,
		},
		{
			id: `member2-${uuidv4()}`,
			role: 'user',
			counter: 0,
		},
		{
			id: `member3-${uuidv4()}`,
			role: 'user',
			counter: 0,
		},
	];

	const runWithOtherOperations = async function(op) {
		const op2 = channel.update({ color: 'green' }, { text: 'got new message!' });
		const op3 = channel.sendMessage({ text: 'new message' });
		const op4 = channel.sendMessage({ text: 'new message' });
		const results = await Promise.all([op, op2, op3, op4]);
		return results[0];
	};

	let channel;
	let client;
	before(async function() {
		client = await getTestClientForUser(johnID);
		await createUsers(
			members.map(function(member) {
				return member.id;
			}),
		);

		channel = client.channel('messaging', channelId, {
			color: 'green',
			members: [members[0].id],
		});
		const response = await channel.create();
		expect(response.channel.color).to.equal('green');
		expect(response.channel.cid).to.equal(cid);
		expect(response.channel.members).to.equal(undefined);
		expect(response.members.length).to.equal(1);
	});

	it('channel state must be updated after removing a member', async function() {
		const resp = await runWithOtherOperations(channel.removeMembers([members[0].id]));
		expect(resp.members.length).to.be.equal(0);
		const channelState = await channel.watch();
		expect(channelState.members.length).to.be.equal(0);
	});

	it('channel state must be updated after adding a member', async function() {
		const resp = await runWithOtherOperations(channel.addMembers([members[0].id]));
		expect(resp.members.length).to.be.equal(1);
		const channelState = await channel.watch();
		expect(channelState.members.length).to.be.equal(1);
		expect(channelState.members[0].user.id).to.be.equal(members[0].id);
	});

	it('channel state must be updated after adding multiple members', async function() {
		const resp = await runWithOtherOperations(
			channel.addMembers([members[0].id, members[1].id, members[2].id]),
		);
		expect(resp.members.length).to.be.equal(3);
		const channelState = await channel.watch();
		expect(channelState.members.length).to.be.equal(3);
		expect(channelState.members[0].user.id).to.be.equal(members[0].id);
		expect(channelState.members[1].user.id).to.be.equal(members[1].id);
		expect(channelState.members[2].user.id).to.be.equal(members[2].id);
	});

	it('channel state must be updated after removing multiple members', async function() {
		const resp = await runWithOtherOperations(
			channel.removeMembers([members[0].id, members[1].id, members[2].id]),
		);
		expect(resp.members.length).to.be.equal(0);
		const channelState = await channel.watch();
		expect(channelState.members.length).to.be.equal(0);
	});
});
