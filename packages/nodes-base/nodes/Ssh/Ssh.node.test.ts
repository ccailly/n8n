import type { Config, NodeSSH as NodeSSHClass } from 'node-ssh';
import { Ssh } from './Ssh.node';
import type { IDataObject, ICredentialTestFunctions, IExecuteFunctions } from 'n8n-workflow';

// Mock NodeSSH
const mockConnect = jest.fn();
const mockExecCommand = jest.fn();
const mockGetFile = jest.fn();
const mockPutFile = jest.fn();
const mockDispose = jest.fn();

jest.mock('node-ssh', () => {
	return {
		NodeSSH: jest.fn().mockImplementation(() => {
			return {
				connect: mockConnect,
				execCommand: mockExecCommand,
				getFile: mockGetFile,
				putFile: mockPutFile,
				dispose: mockDispose,
			};
		}),
	};
});

describe('SshNode', () => {
	let sshNode: Ssh;
	let credentialTestFunctions: ICredentialTestFunctions;
	let executeFunctions: IExecuteFunctions;

	beforeEach(() => {
		sshNode = new Ssh();
		credentialTestFunctions = {
			getCredentials: jest.fn(),
			getNode: jest.fn().mockReturnValue({
				getNodeName: jest.fn().mockReturnValue('Ssh'),
				getExecutionId: jest.fn().mockReturnValue('test-execution-id'),
				getWorkflow: jest.fn().mockReturnValue({ id: 'test-workflow-id', name: 'Test Workflow' }),
			}),
		} as unknown as ICredentialTestFunctions;

		executeFunctions = {
			getCredentials: jest.fn(),
			getNode: jest.fn().mockReturnValue({
				getNodeName: jest.fn().mockReturnValue('Ssh'),
				getExecutionId: jest.fn().mockReturnValue('test-execution-id'),
				getWorkflow: jest.fn().mockReturnValue({ id: 'test-workflow-id', name: 'Test Workflow' }),
			}),
			getNodeParameter: jest.fn(),
			getInputData: jest.fn().mockReturnValue([{ json: {} }]),
			continueOnFail: jest.fn().mockReturnValue(false),
			assertBinaryData: jest.fn(),
			getBinaryStream: jest.fn(),
			nodeHelpers: {
				copyBinaryFile: jest.fn(),
			},
		} as unknown as IExecuteFunctions;

		// Reset mocks before each test
		mockConnect.mockReset();
		mockExecCommand.mockReset();
		mockGetFile.mockReset();
		mockPutFile.mockReset();
		mockDispose.mockReset();
	});

	describe('sshConnectionTest', () => {
		// Password authentication tests
		it('should connect with password authentication without jump host', async () => {
			const credentials = {
				host: 'target.server.com',
				username: 'user',
				port: 22,
				password: 'password',
			} as IDataObject;

			mockConnect.mockResolvedValue(undefined);

			const result = await sshNode.methods.credentialTest!.sshConnectionTest.call(
				credentialTestFunctions,
				{ data: credentials } as any,
			);

			expect(result.status).toBe('OK');
			expect(mockConnect).toHaveBeenCalledWith({
				host: 'target.server.com',
				username: 'user',
				port: 22,
				password: 'password',
			});
			expect(mockDispose).toHaveBeenCalled();
		});

		it('should connect with password authentication with jump host (user@host)', async () => {
			const credentials = {
				host: 'target.server.com',
				username: 'user',
				port: 22,
				password: 'password',
				jumpHost: 'jumpuser@jump.server.com',
			} as IDataObject;

			mockConnect.mockResolvedValue(undefined);

			const result = await sshNode.methods.credentialTest!.sshConnectionTest.call(
				credentialTestFunctions,
				{ data: credentials } as any,
			);

			expect(result.status).toBe('OK');
			expect(mockConnect).toHaveBeenCalledWith({
				host: 'target.server.com',
				username: 'user',
				port: 22,
				password: 'password',
				proxyCommand: 'ssh -W %h:%p jumpuser@jump.server.com',
			});
			expect(mockDispose).toHaveBeenCalled();
		});

		it('should connect with password authentication with jump host (host only)', async () => {
			const credentials = {
				host: 'target.server.com',
				username: 'user',
				port: 22,
				password: 'password',
				jumpHost: 'jump.server.com',
			} as IDataObject;

			mockConnect.mockResolvedValue(undefined);

			const result = await sshNode.methods.credentialTest!.sshConnectionTest.call(
				credentialTestFunctions,
				{ data: credentials } as any,
			);

			expect(result.status).toBe('OK');
			expect(mockConnect).toHaveBeenCalledWith({
				host: 'target.server.com',
				username: 'user',
				port: 22,
				password: 'password',
				proxyCommand: 'ssh -W %h:%p user@jump.server.com',
			});
			expect(mockDispose).toHaveBeenCalled();
		});

		// Private key authentication tests
		it('should connect with private key authentication without jump host', async () => {
			const credentials = {
				host: 'target.server.com',
				username: 'user',
				port: 22,
				privateKey: 'privatekeycontent',
			} as IDataObject;

			mockConnect.mockResolvedValue(undefined);

			const result = await sshNode.methods.credentialTest!.sshConnectionTest.call(
				credentialTestFunctions,
				{ data: credentials } as any,
			);

			expect(result.status).toBe('OK');
			expect(mockConnect).toHaveBeenCalledWith({
				host: 'target.server.com',
				username: 'user',
				port: 22,
				privateKey: '-----BEGIN RSA PRIVATE KEY-----\nprivatekeycontent\n-----END RSA PRIVATE KEY-----',
			});
			expect(mockDispose).toHaveBeenCalled();
		});

		it('should connect with private key authentication with jump host and passphrase', async () => {
			const credentials = {
				host: 'target.server.com',
				username: 'user',
				port: 22,
				privateKey: 'privatekeycontent',
				passphrase: 'testpassphrase',
				jumpHost: 'jumpuser@jump.server.com',
			} as IDataObject;

			mockConnect.mockResolvedValue(undefined);

			const result = await sshNode.methods.credentialTest!.sshConnectionTest.call(
				credentialTestFunctions,
				{ data: credentials } as any,
			);

			expect(result.status).toBe('OK');
			expect(mockConnect).toHaveBeenCalledWith({
				host: 'target.server.com',
				username: 'user',
				port: 22,
				privateKey: '-----BEGIN RSA PRIVATE KEY-----\nprivatekeycontent\n-----END RSA PRIVATE KEY-----',
				passphrase: 'testpassphrase',
				proxyCommand: 'ssh -W %h:%p jumpuser@jump.server.com',
			});
			expect(mockDispose).toHaveBeenCalled();
		});

		it('should return error if connection fails', async () => {
			const credentials = {
				host: 'target.server.com',
				username: 'user',
				port: 22,
				password: 'password',
			} as IDataObject;

			mockConnect.mockRejectedValue(new Error('Connection error'));

			const result = await sshNode.methods.credentialTest!.sshConnectionTest.call(
				credentialTestFunctions,
				{ data: credentials } as any,
			);

			expect(result.status).toBe('Error');
			expect(result.message).toBe('SSH connection failed: Connection error');
			expect(mockDispose).toHaveBeenCalled();
		});
	});

	describe('execute', () => {
		// Mock getCredentials for execute tests
		const mockGetPasswordCreds = jest.fn();
		const mockGetPrivateKeyCreds = jest.fn();

		beforeEach(() => {
			mockGetPasswordCreds.mockResolvedValue({
				host: 'target.server.com',
				username: 'user',
				port: 22,
				password: 'password',
			} as IDataObject);
			mockGetPrivateKeyCreds.mockResolvedValue({
				host: 'target.server.com',
				username: 'user',
				port: 22,
				privateKey: 'privatekeycontent',
			} as IDataObject);

			(executeFunctions.getCredentials as jest.Mock).mockImplementation((type: string) => {
				if (type === 'sshPassword') {
					return mockGetPasswordCreds();
				}
				if (type === 'sshPrivateKey') {
					return mockGetPrivateKeyCreds();
				}
				return Promise.resolve(undefined);
			});
		});

		// Command execution tests
		it('should execute command with password authentication and jump host', async () => {
			(executeFunctions.getNodeParameter as jest.Mock).mockImplementation((name: string) => {
				if (name === 'authentication') return 'password';
				if (name === 'resource') return 'command';
				if (name === 'operation') return 'execute';
				if (name === 'command') return 'ls -la';
				if (name === 'cwd') return '/home/user';
				return undefined;
			});
			mockGetPasswordCreds.mockResolvedValue({
				host: 'target.server.com',
				username: 'user',
				port: 22,
				password: 'password',
				jumpHost: 'jump.server.com',
			} as IDataObject);
			mockExecCommand.mockResolvedValue({ stdout: 'command output', stderr: '' });

			const result = await sshNode.execute.call(executeFunctions);

			expect(mockConnect).toHaveBeenCalledWith(expect.objectContaining({
				proxyCommand: 'ssh -W %h:%p user@jump.server.com',
			}));
			expect(mockExecCommand).toHaveBeenCalledWith('ls -la', { cwd: '/home/user' });
			expect(result[0][0].json).toEqual({ stdout: 'command output', stderr: '' });
			expect(mockDispose).toHaveBeenCalled();
		});

		it('should execute command with private key authentication and jump host (user@host)', async () => {
			(executeFunctions.getNodeParameter as jest.Mock).mockImplementation((name: string) => {
				if (name === 'authentication') return 'privateKey';
				if (name === 'resource') return 'command';
				if (name === 'operation') return 'execute';
				if (name === 'command') return 'pwd';
				if (name === 'cwd') return '~'; // Test home dir resolution
				return undefined;
			});
			mockGetPrivateKeyCreds.mockResolvedValue({
				host: 'target.server.com',
				username: 'pkuser',
				port: 22,
				privateKey: 'privatekeycontent',
				jumpHost: 'jumpuser@otherjump.com',
			} as IDataObject);
			// Mock home directory resolution
			mockExecCommand.mockImplementation((command: string) => {
				if (command === 'echo $HOME') {
					return Promise.resolve({ stdout: '/home/pkuser/', stderr: '' });
				}
				return Promise.resolve({ stdout: 'command output for pwd', stderr: '' });
			});


			const result = await sshNode.execute.call(executeFunctions);

			expect(mockConnect).toHaveBeenCalledWith(expect.objectContaining({
				username: 'pkuser',
				proxyCommand: 'ssh -W %h:%p jumpuser@otherjump.com',
			}));
			expect(mockExecCommand).toHaveBeenCalledWith('echo $HOME'); // For home dir resolution
			expect(mockExecCommand).toHaveBeenCalledWith('pwd', { cwd: '/home/pkuser/' });
			expect(result[0][0].json).toEqual({ stdout: 'command output for pwd', stderr: '' });
			expect(mockDispose).toHaveBeenCalled();
		});

		// File operation tests
		it('should download a file with private key authentication and jump host', async () => {
			(executeFunctions.getNodeParameter as jest.Mock).mockImplementation((name: string, index?: number, fallback?: any) => {
				if (name === 'authentication') return 'privateKey';
				if (name === 'resource') return 'file';
				if (name === 'operation') return 'download';
				if (name === 'path') return '/remote/file.txt';
				if (name === 'binaryPropertyName') return 'downloadedFile';
				if (name === 'options.fileName') return ''; // No override
				return fallback;
			});
			mockGetPrivateKeyCreds.mockResolvedValue({
				host: 'target.server.com',
				username: 'pkuser',
				port: 22,
				privateKey: 'privatekeycontent',
				jumpHost: 'jump@jumpserver.net',
			} as IDataObject);
			mockGetFile.mockResolvedValue(undefined); // Simulates successful file download
			(executeFunctions.nodeHelpers.copyBinaryFile as jest.Mock).mockResolvedValue({
				fileName: 'file.txt',
				mimeType: 'application/octet-stream',
				size: 123,
			} as any);


			const initialItems = [{ json: { someData: 'value' }, binary: {} }];
			(executeFunctions.getInputData as jest.Mock).mockReturnValue(initialItems);

			const result = await sshNode.execute.call(executeFunctions);

			expect(mockConnect).toHaveBeenCalledWith(expect.objectContaining({
				username: 'pkuser',
				proxyCommand: 'ssh -W %h:%p jump@jumpserver.net',
			}));
			// First arg to getFile is localPath, which is a temp path, so we check the remotePath (second arg)
			expect(mockGetFile).toHaveBeenCalledWith(expect.any(String), '/remote/file.txt');
			expect(executeFunctions.nodeHelpers.copyBinaryFile).toHaveBeenCalled();
			expect(result[0][0].binary!.downloadedFile).toBeDefined();
			expect(result[0][0].binary!.downloadedFile.fileName).toBe('file.txt');
			expect(mockDispose).toHaveBeenCalled();
		});

		it('should upload a file with password authentication and jump host', async () => {
			(executeFunctions.getNodeParameter as jest.Mock).mockImplementation((name: string, index?: number, fallback?: any) => {
				if (name === 'authentication') return 'password';
				if (name === 'resource') return 'file';
				if (name === 'operation') return 'upload';
				if (name === 'path') return '/remote/uploadDir/';
				if (name === 'binaryPropertyName') return 'uploadFile';
				if (name === 'options.fileName') return 'customName.dat'; // With override
				return fallback;
			});
			mockGetPasswordCreds.mockResolvedValue({
				host: 'target.server.com',
				username: 'user',
				port: 22,
				password: 'password',
				jumpHost: 'plainjump.server.com', // Host only jump
			} as IDataObject);
			(executeFunctions.assertBinaryData as jest.Mock).mockReturnValue({
				fileName: 'original.dat',
				mimeType: 'application/octet-stream',
				id: 'test-binary-id', // Simulate stored binary data
			});
			(executeFunctions.getBinaryStream as jest.Mock).mockResolvedValue('binary stream data' as any);
			mockPutFile.mockResolvedValue(undefined); // Simulates successful file upload

			const result = await sshNode.execute.call(executeFunctions);

			expect(mockConnect).toHaveBeenCalledWith(expect.objectContaining({
				username: 'user',
				proxyCommand: 'ssh -W %h:%p user@plainjump.server.com',
			}));
			expect(executeFunctions.assertBinaryData).toHaveBeenCalledWith(0, 'uploadFile');
			expect(executeFunctions.getBinaryStream).toHaveBeenCalledWith('test-binary-id');
			// First arg to putFile is localPath (temp path), second is remotePath
			expect(mockPutFile).toHaveBeenCalledWith(expect.any(String), '/remote/uploadDir/customName.dat');
			expect(result[0][0].json.success).toBe(true);
			expect(mockDispose).toHaveBeenCalled();
		});

		// Test existing functionality (without jump host)
		it('should execute command with password auth (no jump host)', async () => {
			(executeFunctions.getNodeParameter as jest.Mock).mockImplementation((name: string) => {
				if (name === 'authentication') return 'password';
				if (name === 'resource') return 'command';
				if (name === 'operation') return 'execute';
				if (name === 'command') return 'ls';
				if (name === 'cwd') return '/';
				return undefined;
			});
			mockExecCommand.mockResolvedValue({ stdout: 'ls output', stderr: '' });

			const result = await sshNode.execute.call(executeFunctions);

			expect(mockConnect).toHaveBeenCalledWith({
				host: 'target.server.com',
				username: 'user',
				port: 22,
				password: 'password',
				// No proxyCommand should be present
			});
			expect(mockConnect.mock.calls[0][0].proxyCommand).toBeUndefined();
			expect(mockExecCommand).toHaveBeenCalledWith('ls', { cwd: '/' });
			expect(result[0][0].json).toEqual({ stdout: 'ls output', stderr: '' });
			expect(mockDispose).toHaveBeenCalled();
		});
	});
});
