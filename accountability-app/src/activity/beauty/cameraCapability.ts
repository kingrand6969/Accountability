export type BeautyCameraPermissionStatus =
  | 'not-determined'
  | 'authorized'
  | 'denied'
  | 'restricted';

export type BeautyCameraCapabilityCode =
  | 'requesting-permission'
  | 'permission-denied'
  | 'permission-restricted'
  | 'finding-device'
  | 'device-unavailable'
  | 'camera-error'
  | 'ready';

export interface BeautyCameraCapability {
  code: BeautyCameraCapabilityCode;
  canRenderCamera: boolean;
  canOpenSettings: boolean;
  title: string;
  message: string;
}

interface BeautyCameraCapabilityInput {
  permissionStatus: BeautyCameraPermissionStatus;
  isRequestingPermission: boolean;
  hasFrontCamera: boolean;
  isDeviceLookupSettled: boolean;
  cameraError: string | null;
}

export function getBeautyCameraCapability({
  permissionStatus,
  isRequestingPermission,
  hasFrontCamera,
  isDeviceLookupSettled,
  cameraError,
}: BeautyCameraCapabilityInput): BeautyCameraCapability {
  if (cameraError) {
    return {
      code: 'camera-error',
      canRenderCamera: false,
      canOpenSettings: false,
      title: 'Camera unavailable',
      message: cameraError,
    };
  }

  if (permissionStatus === 'not-determined' || isRequestingPermission) {
    return {
      code: 'requesting-permission',
      canRenderCamera: false,
      canOpenSettings: false,
      title: 'Requesting camera access',
      message: 'Approve camera access to start the private on-device preview.',
    };
  }

  if (permissionStatus === 'denied') {
    return {
      code: 'permission-denied',
      canRenderCamera: false,
      canOpenSettings: true,
      title: 'Camera access is off',
      message: 'Enable camera access in Settings to use the beauty camera preview.',
    };
  }

  if (permissionStatus === 'restricted') {
    return {
      code: 'permission-restricted',
      canRenderCamera: false,
      canOpenSettings: false,
      title: 'Camera access is restricted',
      message: 'This device does not currently allow camera access for this app.',
    };
  }

  if (!hasFrontCamera) {
    return isDeviceLookupSettled
      ? {
          code: 'device-unavailable',
          canRenderCamera: false,
          canOpenSettings: false,
          title: 'Front camera unavailable',
          message: 'A front-facing camera could not be found on this device.',
        }
      : {
          code: 'finding-device',
          canRenderCamera: false,
          canOpenSettings: false,
          title: 'Finding the front camera',
          message: 'The private camera preview will start when the device is ready.',
        };
  }

  return {
    code: 'ready',
    canRenderCamera: true,
    canOpenSettings: false,
    title: 'Camera ready',
    message: 'The preview and face count stay on this device.',
  };
}
