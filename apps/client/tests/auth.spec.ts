import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should open the auth modal when clicking sign in', async ({ page }) => {
    // Look for sign in button and click it
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Auth modal should be visible
    await expect(page.getByTestId('auth-modal-title')).toBeVisible();
    await expect(page.getByTestId('login-email')).toBeVisible();
    await expect(page.getByTestId('login-password')).toBeVisible();
  });

  test('should switch between login and register forms', async ({ page }) => {
    // Open auth modal
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Switch to register form
    await page.getByTestId('switch-to-register').click();
    
    // Check that register form is displayed
    await expect(page.getByTestId('auth-modal-title')).toHaveText('Create Account');
    await expect(page.getByTestId('register-onelink')).toBeVisible();
    
    // Switch back to login form
    await page.getByTestId('switch-to-login').click();
    
    // Check that login form is displayed again
    await expect(page.getByTestId('auth-modal-title')).toHaveText('Sign In');
  });

  test('should display validation errors for empty fields', async ({ page }) => {
    // Open auth modal
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Focus and blur each field to trigger validation
    await page.getByTestId('login-email').click();
    await page.getByTestId('login-email').blur();
    await page.getByTestId('login-password').click();
    await page.getByTestId('login-password').blur();
    
    // Now try to submit the form
    await page.getByTestId('login-submit').click();
    
    // Check validation error messages
    await expect(page.getByTestId('login-email').locator('..').filter({ hasText: 'Please enter a valid email address' })).toBeVisible();
    await expect(page.getByTestId('login-password').locator('..').filter({ hasText: 'Password must be at least 6 characters long' })).toBeVisible();
  });

  test('should display validation error for invalid email format', async ({ page }) => {
    // Open auth modal
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Enter invalid email
    await page.getByTestId('login-email').fill('invalid-email');
    // Trigger validation by removing focus
    await page.getByTestId('login-email').blur();
    
    // Check validation error
    await expect(page.getByText('Please enter a valid email address')).toBeVisible();
  });

  test('should validate registration form fields', async ({ page }) => {
    // Open auth modal
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Switch to register form
    await page.getByTestId('switch-to-register').click();
    
    // Submit empty form - note: the button is disabled, so we'll need to trigger validations differently
    // Fill and blur each field to trigger validation
    await page.getByTestId('register-email').click();
    await page.getByTestId('register-email').blur();
    await page.getByTestId('register-password').click();
    await page.getByTestId('register-password').blur();
    await page.getByTestId('register-onelink').click();
    await page.getByTestId('register-onelink').blur();
    
    await expect(page.getByText('Please enter a valid email address')).toBeVisible();
    await expect(page.getByText('Password must be at least 8 characters long')).toBeVisible();
    await expect(page.getByText('URL must be at least 3 characters')).toBeVisible();
  });

  test('should validate password requirements on registration', async ({ page }) => {
    // Open auth modal
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Switch to register form
    await page.getByTestId('switch-to-register').click();
    
    // Enter a weak password
    await page.getByTestId('register-email').fill('test@example.com');
    await page.getByTestId('register-password').fill('12345');
    await page.getByTestId('register-password').blur();
    
    // Check password validation error
    await expect(page.getByText('Password must be at least 8 characters long')).toBeVisible();
    
    // Enter a longer password without uppercase letter
    await page.getByTestId('register-password').fill('12345678');
    await page.getByTestId('register-password').blur();
    
    // Check password validation error for uppercase requirement
    await expect(page.getByText('Password must contain at least one uppercase letter')).toBeVisible();
    
    // Enter a strong password
    await page.getByTestId('register-password').fill('Password123');
    await page.getByTestId('register-password').blur();
    
    // Check password strength indicator
    await expect(page.getByText('Password requirements:')).toBeVisible();
    await expect(page.getByText('At least 8 characters')).toBeVisible();
  });

  test('should show forgot password form', async ({ page }) => {
    // Open auth modal
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Click forgot password link
    await page.getByTestId('forgot-password').click();
    
    // Verify reset password form is shown
    await expect(page.getByTestId('auth-modal-title')).toHaveText('Reset Password');
    await expect(page.getByText('Enter your email address below')).toBeVisible();
    await expect(page.getByTestId('reset-email')).toBeVisible();
    await expect(page.getByTestId('reset-submit')).toBeVisible();
  });

  test('should validate email on password reset form', async ({ page }) => {
    // Open auth modal
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Click forgot password link
    await page.getByTestId('forgot-password').click();
    
    // Focus and then blur the email field to trigger validation
    await page.getByTestId('reset-email').click();
    await page.getByTestId('reset-email').blur();
    
    // Submit form 
    await page.getByTestId('reset-submit').click();
    
    // Check validation error
    await expect(page.getByTestId('reset-email').locator('..').filter({ hasText: 'Please enter a valid email address' })).toBeVisible();
  });

  test('should check URL availability during registration', async ({ page }) => {
    // Open auth modal
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Switch to register form
    await page.getByTestId('switch-to-register').click();
    
    // Type a URL in the URL field
    await page.getByTestId('register-onelink').fill('test-user');
    
    // Check for URL availability indicator
    await expect(page.getByTestId('public-url-preview')).toBeVisible();
    // Check that URL is showing in the preview
    await expect(page.getByTestId('public-url-preview')).toContainText('Public URL:');
  });

  // Tests for successful login, registration and error handling are commented out
  // as they require real API interaction and may fail in automated test environments

  /* 
  test.describe('Authentication with real API', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
    });
    
    test('should handle successful login', async ({ page }) => {
      // Open auth modal
      await page.getByRole('button', { name: 'Sign In' }).click();
      
      // Fill in login form with test credentials
      await page.getByTestId('login-email').fill('test@example.com');
      await page.getByTestId('login-password').fill('password123');
      
      // Submit form
      await page.getByTestId('login-submit').click();
      
      // Check for successful login indication - waiting for navigation to complete
      await expect(page.getByLabel('User menu')).toBeVisible({ timeout: 5000 });
    });
    
    test('should handle successful registration', async ({ page }) => {
      // Generate unique email to avoid conflicts
      const uniqueEmail = `test-${Date.now()}@example.com`;
      const uniqueUrl = `test-user-${Date.now()}`;
      
      // Open auth modal
      await page.getByRole('button', { name: 'Sign In' }).click();
      
      // Switch to register form
      await page.getByTestId('switch-to-register').click();
      
      // Fill in registration form
      await page.getByTestId('register-email').fill(uniqueEmail);
      await page.getByTestId('register-password').fill('Password123!');
      await page.getByTestId('register-onelink').fill(uniqueUrl);
      
      // Submit form
      await page.getByTestId('register-submit').click();
      
      // Check for successful registration indication
      await expect(page.getByLabel('User menu')).toBeVisible({ timeout: 5000 });
    });
    
    test('should handle login errors', async ({ page }) => {
      // Open auth modal
      await page.getByRole('button', { name: 'Sign In' }).click();
      
      // Fill in login form with invalid credentials
      await page.getByTestId('login-email').fill('test@example.com');
      await page.getByTestId('login-password').fill('wrong-password');
      
      // Submit form
      await page.getByTestId('login-submit').click();
      
      // Check for error message (using toast notification)
      await expect(page.getByText('Invalid credentials').or(page.getByText('Invalid email or password'))).toBeVisible({ timeout: 5000 });
    });
    
    test('should handle password reset request', async ({ page }) => {
      // Open auth modal
      await page.getByRole('button', { name: 'Sign In' }).click();
      
      // Click forgot password link
      await page.getByTestId('forgot-password').click();
      
      // Fill in email
      await page.getByTestId('reset-email').fill('test@example.com');
      
      // Submit form
      await page.getByTestId('reset-submit').click();
      
      // Check for confirmation message (toast notification)
      await expect(page.getByText('Reset email sent')).toBeVisible({ timeout: 5000 });
    });
  });
  */
});