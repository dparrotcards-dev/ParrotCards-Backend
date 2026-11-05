import { z } from 'zod';

export const birthDetailsSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name is too long'),
  gender: z.enum(['Male', 'Female', 'Other', 'Non-Binary'], {
    errorMap: () => ({ message: 'Gender is required (Male, Female, Other, or Non-Binary)' }),
  }),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be in YYYY-MM-DD format')
    .refine((val) => {
      const d = new Date(val);
      return !isNaN(d.getTime()) && d <= new Date();
    }, 'Date of birth must be a valid date in the past'),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Time of birth must be in HH:mm or HH:mm:ss format'),
  place: z.string().min(2, 'Birth place must be at least 2 characters long'),
  latitude: z.number({ invalid_type_error: 'Latitude must be a valid number from birthplace selection' }).min(-90).max(90, 'Latitude must be between -90 and 90'),
  longitude: z.number({ invalid_type_error: 'Longitude must be a valid number from birthplace selection' }).min(-180).max(180, 'Longitude must be between -180 and 180'),
  timezone: z.number({ invalid_type_error: 'Timezone must be a valid number' }).min(-12).max(14, 'Timezone must be between -12 and +14'),
  ianaTimezone: z.string().optional(),
  guestSessionId: z.string().optional(),
});

export type BirthDetailsInput = z.infer<typeof birthDetailsSchema>;
