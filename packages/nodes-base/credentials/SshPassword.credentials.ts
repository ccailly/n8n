import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class SshPassword implements ICredentialType {
	name = 'sshPassword';

	displayName = 'SSH Password';

	documentationUrl = 'ssh';

	properties: INodeProperties[] = [
		{
			displayName: 'Host',
			name: 'host',
			required: true,
			type: 'string',
			default: '',
			placeholder: 'localhost',
		},
		{
			displayName: 'Port',
			name: 'port',
			required: true,
			type: 'number',
			default: 22,
		},
		{
			displayName: 'Username',
			name: 'username',
			type: 'string',
			default: '',
		},
	{
		displayName: 'Jump Host',
		name: 'jumpHost',
		type: 'string',
		default: '',
		placeholder: 'user@jump-server.com',
		description: 'Optional. The jump host to use for the SSH connection. Format: user@host or host (uses the same username as the target server).',
	},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
		},
	];
}
