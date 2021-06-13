const RegUser = /^U:.+$/;
const RegDevice = /^D:.+$/;
const RegRoles = /^(U:|D:).+$/;

function isUser(clienId: string): boolean {
  return RegUser.test(clienId);
}

function isDevice(clienId: string): boolean {
  return RegDevice.test(clienId);
}

function isAvailableRoles(clienId: string): boolean {
  return RegRoles.test(clienId);
}

export default {
  isUser,
  isDevice,
  isAvailableRoles,
};