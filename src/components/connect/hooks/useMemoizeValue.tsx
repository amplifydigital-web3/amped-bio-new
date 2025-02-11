import { useRef, useEffect } from 'react';

function useMemoizeValue<T>(value: T): [T | undefined, T] {
  // useRef will hold the previous value
  const previousValue = useRef<T | undefined>(undefined);

  // Memoize the previous and current value
  useEffect(() => {
    previousValue.current = value;
  }, [value]);

  // Return an array with the previous and current value
  return [previousValue.current, value];
}

export default useMemoizeValue;
