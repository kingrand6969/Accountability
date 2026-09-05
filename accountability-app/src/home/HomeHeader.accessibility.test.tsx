import { describe, expect, jest, test } from '@jest/globals';
import TestRenderer, { act } from 'react-test-renderer';

const mockPush = jest.fn();

jest.mock('expo-router', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  return {
    useRouter: () => ({ push: mockPush }),
    useFocusEffect: (effect: () => void | (() => void)) =>
      ReactModule.useEffect(effect, [effect]),
  };
});

jest.mock('./api', () => ({
  getHomeStats: async () => ({
    streak: 4,
    todayCount: 2,
    weekWorkouts: 3,
    weekActivities: 5,
    buddyCount: 1,
    buddyRequests: 0,
  }),
}));

import { HomeHeader } from './HomeHeader';

describe('HomeHeader accessibility', () => {
  test('renders every labeled navigation action with the button role', async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<HomeHeader />);
      await Promise.resolve();
    });

    for (const label of [
      'Share your streak',
      'Accountability buddies',
      'See your full progress',
    ]) {
      const controls = renderer!.root.findAll((node) => node.props.accessibilityLabel === label);
      expect(controls.some((node) => node.props.accessibilityRole === 'button')).toBe(true);
    }

    act(() => renderer!.unmount());
  });
});
