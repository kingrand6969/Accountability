import { describe, expect, it } from '@jest/globals';

import {
  getBeautyCameraCapability,
  reconcileBeautyCameraDeviceLookup,
} from './cameraCapability';

describe('reconcileBeautyCameraDeviceLookup', () => {
  it('resets a settled lookup when camera permission changes', () => {
    expect(
      reconcileBeautyCameraDeviceLookup(
        { permissionStatus: 'authorized', isSettled: true },
        'denied',
        false,
      ),
    ).toEqual({ permissionStatus: 'denied', isSettled: false });
  });

  it('settles when a front camera appears and keeps that result for the attempt', () => {
    const settled = reconcileBeautyCameraDeviceLookup(
      { permissionStatus: 'authorized', isSettled: false },
      'authorized',
      true,
    );

    expect(settled).toEqual({
      permissionStatus: 'authorized',
      isSettled: true,
    });
    expect(
      reconcileBeautyCameraDeviceLookup(settled, 'authorized', false),
    ).toBe(settled);
  });

  it('keeps unchanged lookup state referentially stable', () => {
    const current = {
      permissionStatus: 'authorized' as const,
      isSettled: false,
    };

    expect(
      reconcileBeautyCameraDeviceLookup(current, 'authorized', false),
    ).toBe(current);
  });
});

describe('getBeautyCameraCapability', () => {
  it('keeps the camera inactive while permission is being requested', () => {
    expect(
      getBeautyCameraCapability({
        permissionStatus: 'not-determined',
        isRequestingPermission: true,
        hasFrontCamera: false,
        isDeviceLookupSettled: false,
        cameraError: null,
      }),
    ).toEqual({
      code: 'requesting-permission',
      canRenderCamera: false,
      canOpenSettings: false,
      title: 'Requesting camera access',
      message: 'Approve camera access to start the private on-device preview.',
    });
  });

  it('offers Settings after camera permission is denied', () => {
    expect(
      getBeautyCameraCapability({
        permissionStatus: 'denied',
        isRequestingPermission: false,
        hasFrontCamera: true,
        isDeviceLookupSettled: true,
        cameraError: null,
      }),
    ).toMatchObject({
      code: 'permission-denied',
      canRenderCamera: false,
      canOpenSettings: true,
    });
  });

  it('reports a missing front camera only after device lookup settles', () => {
    expect(
      getBeautyCameraCapability({
        permissionStatus: 'authorized',
        isRequestingPermission: false,
        hasFrontCamera: false,
        isDeviceLookupSettled: false,
        cameraError: null,
      }).code,
    ).toBe('finding-device');

    expect(
      getBeautyCameraCapability({
        permissionStatus: 'authorized',
        isRequestingPermission: false,
        hasFrontCamera: false,
        isDeviceLookupSettled: true,
        cameraError: null,
      }).code,
    ).toBe('device-unavailable');
  });

  it('allows rendering only when permission and a front camera are available', () => {
    expect(
      getBeautyCameraCapability({
        permissionStatus: 'authorized',
        isRequestingPermission: false,
        hasFrontCamera: true,
        isDeviceLookupSettled: true,
        cameraError: null,
      }),
    ).toMatchObject({
      code: 'ready',
      canRenderCamera: true,
      canOpenSettings: false,
    });
  });

  it('prioritizes a runtime camera error over an otherwise ready state', () => {
    expect(
      getBeautyCameraCapability({
        permissionStatus: 'authorized',
        isRequestingPermission: false,
        hasFrontCamera: true,
        isDeviceLookupSettled: true,
        cameraError: 'Camera session failed.',
      }),
    ).toMatchObject({
      code: 'camera-error',
      canRenderCamera: false,
      message: 'Camera session failed.',
    });
  });
});
