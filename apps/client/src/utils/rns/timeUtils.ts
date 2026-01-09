import { DateTime, Duration } from "luxon";

// Constants for duration conversion
export const SECONDS_IN_MINUTE = 60;
export const SECONDS_IN_HOUR = 3600;
export const SECONDS_IN_DAY = 86400;
export const SECONDS_IN_MONTH = 2592000;
export const SECONDS_IN_YEAR = 31536000;

export type DurationUnit = 'minute' | 'hour' | 'day' | 'month' | 'year';

// Determine the most appropriate duration unit based on seconds
export function getDurationUnitFromSeconds(seconds: number): DurationUnit {
    if (seconds >= SECONDS_IN_YEAR) {
        return 'year';
    } else if (seconds >= SECONDS_IN_MONTH) {
        return 'month';
    } else if (seconds >= SECONDS_IN_DAY) {
        return 'day';
    } else if (seconds >= SECONDS_IN_HOUR) {
        return 'hour';
    } else {
        return 'minute';
    }
}

// Get step size in seconds for a given unit
export function getStepForUnit(unit: DurationUnit): bigint {
    const steps = {
        minute: BigInt(SECONDS_IN_MINUTE),
        hour: BigInt(SECONDS_IN_HOUR),
        day: BigInt(SECONDS_IN_DAY),
        month: BigInt(SECONDS_IN_MONTH),
        year: BigInt(SECONDS_IN_YEAR)
    };
    return steps[unit];
}

// Get maximum duration in seconds for a given unit
export function getMaxDurationForUnit(unit: DurationUnit): bigint {
    const maxes = {
        minute: BigInt(SECONDS_IN_DAY * 7),      // 7 days
        hour: BigInt(SECONDS_IN_DAY * 30),       // 30 days
        day: BigInt(SECONDS_IN_YEAR * 2),        // 2 years
        month: BigInt(SECONDS_IN_YEAR * 5),      // 5 years
        year: BigInt(SECONDS_IN_YEAR * 5)        // 5 years
    };
    return maxes[unit];
}

// Format duration with appropriate unit based on magnitude
export function formatDuration(seconds: number): string {
    const duration = Duration.fromObject({ seconds });

    if (duration.as('years') >= 1) {
        return `${duration.as('years').toFixed(1)} ${duration.as('years') === 1 ? 'year' : 'years'}`;
    } else if (duration.as('months') >= 1) {
        return `${duration.as('months').toFixed(1)} ${duration.as('months') === 1 ? 'month' : 'months'}`;
    } else if (duration.as('days') >= 1) {
        return `${duration.as('days').toFixed(1)} ${duration.as('days') === 1 ? 'day' : 'days'}`;
    } else if (duration.as('hours') >= 1) {
        return `${duration.as('hours').toFixed(1)} ${duration.as('hours') === 1 ? 'hour' : 'hours'}`;
    } else {
        return `${duration.as('minutes').toFixed(0)} ${duration.as('minutes') === 1 ? 'minute' : 'minutes'}`;
    }
}

// Calculate expiry date from now plus a duration in seconds
export function getExpiryDate(seconds: number): string {
    const expiryDate = DateTime.now().plus({ seconds });
    return expiryDate.toFormat('MMMM d, yyyy');
}
