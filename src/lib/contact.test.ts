import { describe, expect, it } from 'vitest';
import { validate_contact_form } from './contact';

const valid = {
    from_email: 'visitor@example.com',
    subject: 'Hello',
    message: 'Great site!',
};

describe('validate_contact_form', () => {
    it('accepts a valid form', () => {
        expect(validate_contact_form(valid)).toBeNull();
    });

    it('flags the first failing field in order', () => {
        expect(validate_contact_form({ ...valid, from_email: 'nope' })).toBe(
            'Please enter a valid email address.',
        );
        expect(validate_contact_form({ ...valid, subject: '  ' })).toBe(
            'Please enter a subject.',
        );
        expect(validate_contact_form({ ...valid, message: '' })).toBe(
            'Please enter a message.',
        );
        expect(
            validate_contact_form({
                from_email: '',
                subject: '',
                message: '',
            }),
        ).toBe('Please enter a valid email address.');
    });

    it('enforces caps', () => {
        expect(
            validate_contact_form({ ...valid, message: 'm'.repeat(5001) }),
        ).toBe('Please enter a message.');
    });
});
