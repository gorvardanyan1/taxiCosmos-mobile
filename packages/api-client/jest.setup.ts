import { notifyManager } from '@tanstack/react-query';
import { act } from '@testing-library/react-native';

// TanStack Query batches its notifications onto a timer, so a result can reach React after the test's `act()` scope closed (a warning, and
// an update React may not flush). Delivering each batch inside `act` keeps hook tests deterministic. Tests only: the app keeps the default.
notifyManager.setScheduler((callback) => {
  act(() => {
    callback();
  });
});
