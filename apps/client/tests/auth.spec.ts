import { test, expect } from '@playwright/test';

// Helper function to generate unique test emails
const generateUniqueEmail = (prefix = 'test') => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${randomStr}@example.com`;
};
// Test credentials used for registration, login, and password reset tests
let testUser = {
  email: '',
  password: '',
  onelink: ''
};

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

  // test('should validate password requirements on registration', async ({ page }) => {
  //   // Open auth modal
  //   await page.getByRole('button', { name: 'Sign In' }).click();
    
  //   // Switch to register form
  //   await page.getByTestId('switch-to-register').click();
    
  //   // Enter a weak password
  //   await page.getByTestId('register-email').fill(generateUniqueEmail('validation'));
  //   await page.getByTestId('register-password').fill('12345');
  //   await page.getByTestId('register-password').blur();
    
  //   // Check password validation error
  //   await expect(page.getByText('Password must be at least 8 characters long')).toBeVisible();
    
  //   // Enter a longer password without uppercase letter
  //   await page.getByTestId('register-password').fill('12345678');
  //   await page.getByTestId('register-password').blur();
    
  //   // Check password validation error for uppercase requirement
  //   await expect(page.getByText('Password must contain at least one uppercase letter')).toBeVisible();
    
  //   // Enter a strong password
  //   await page.getByTestId('register-password').fill(testUser.password);
  //   await page.getByTestId('register-password').blur();
    
  //   // Check password strength indicator
  //   await expect(page.getByText('Password requirements:')).toBeVisible();
  //   await expect(page.getByText('At least 8 characters')).toBeVisible();
  // });

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

  test.describe('Authentication with real API', () => {
    // Generate shared test credentials before all tests
    test.beforeAll(() => {
      // Generate unique email and onelink for all tests in this describe block
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 8);
      testUser.email = `test-integrated-${timestamp}-${randomStr}@example.com`;
      testUser.onelink = `test-user-${timestamp}-${randomStr}`;
      testUser.password = 'Password123@';
      console.log(`Using test credentials - Email: ${testUser.email}, Onelink: ${testUser.onelink}, Password: ${testUser.password}`);
    });

    test.beforeEach(async ({ page }) => {
      await page.goto('/');
    });
    
    // This test creates an account that will be used in subsequent tests
    test('should handle successful registration and redirect to dashboard', async ({ page }) => {
      console.log(`Starting registration with email: ${testUser.email}`);
      
      // Open auth modal
      await page.getByRole('button', { name: 'Sign In' }).click();
      
      // Switch to register form
      await page.getByTestId('switch-to-register').click();
      
      // Fill in registration form with our shared test user
      await page.getByTestId('register-onelink').fill(testUser.onelink);
      await page.getByTestId('register-email').fill(testUser.email);
      await page.getByTestId('register-password').fill(testUser.password);
      
      console.log(`Submitting registration with: ${testUser.email}, ${testUser.onelink} ${testUser.password}`);
      
      // Submit form
      await page.getByTestId('register-submit').click();
      
      // Wait for registration to complete and check for redirect
      await expect(page).toHaveURL(new RegExp(`/@${testUser.onelink}/edit`), { timeout: 10000 });
      
      // Verify sidebar component is visible
      const sidebar = page.locator('div').filter({ hasText: /Home\s*Profile\s*Themes\s*Appearance\s*Effects\s*Blocks/ }).first();
      await expect(sidebar).toBeVisible();
      
      // Verify correct panel is selected (default is home)
      await expect(page.getByRole('button', { name: 'Home' }).first()).toHaveClass(/bg-gray-100/);
      
      // Wait for an additional second to ensure database operations complete
      await page.waitForTimeout(1000);
      
      console.log(`Registration complete for: ${testUser.email} ${testUser.password}`);
    });
    
    // This test uses the account created in the registration test
    test('should handle successful login and redirect to dashboard', async ({ page }) => {
      console.log(`Starting login with email: ${testUser.email}`);
      
      // Open auth modal
      await page.getByRole('button', { name: 'Sign In' }).click();
      
      // Fill in login form with our shared test user credentials
      await page.getByTestId('login-email').fill(testUser.email);
      await page.getByTestId('login-password').fill(testUser.password);
      
      console.log(`Submitting login with: ${testUser.email}`);
      
      // Submit form
      await page.getByTestId('login-submit').click();
      
      await expect(page).toHaveURL(new RegExp(`/@${testUser.onelink}/edit`), { timeout: 10000 });

      // Verify sidebar component is visible with expected navigation items
      await expect(page.getByText('Home')).toBeVisible();
      await expect(page.getByText('Profile')).toBeVisible();
      await expect(page.getByText('Themes')).toBeVisible();
      await expect(page.getByText('Appearance')).toBeVisible();
      await expect(page.getByText('Blocks')).toBeVisible();
      
      console.log(`Login successful for: ${testUser.email}`);
    });
    
    // This test uses the same account for password reset
    test('should handle password reset request', async ({ page }) => {
      console.log(`Starting password reset with email: ${testUser.email}`);
      
      // Open auth modal
      await page.getByRole('button', { name: 'Sign In' }).click();
      
      // Click forgot password link
      await page.getByTestId('forgot-password').click();
      
      // Verify that we're on the reset password form
      await expect(page.getByTestId('auth-modal-title')).toHaveText('Reset Password');
      
      // Fill in email with our shared test user email
      await page.getByTestId('reset-email').fill(testUser.email);
      
      console.log(`Submitting password reset for: ${testUser.email}`);
      
      // Submit form
      await page.getByTestId('reset-submit').click();
      
      // Modal should close if request is successful (no need to check for toast)
      await expect(page.getByTestId('auth-modal')).not.toBeVisible({ timeout: 5000 });
      
      console.log(`Password reset requested for: ${testUser.email}`);
    });
    
    test('should handle login errors', async ({ page }) => {
      // Generate a unique email that definitely won't exist in the database
      const nonexistentEmail = generateUniqueEmail('nonexistent');
      
      // Open auth modal
      await page.getByRole('button', { name: 'Sign In' }).click();
      
      // Fill in login form with invalid credentials
      await page.getByTestId('login-email').fill(nonexistentEmail);
      await page.getByTestId('login-password').fill('wrong-password');
      
      // Submit form
      await page.getByTestId('login-submit').click();
      
      // Check for error message in the form (inline error instead of toast)
      await expect(
        page.locator('.bg-red-50').filter({ hasText: /Invalid credentials|Invalid email or password|Authentication failed/ })
      ).toBeVisible({ timeout: 5000 });
      
      // Verify we're still on the login form
      await expect(page.getByTestId('auth-modal-title')).toHaveText('Sign In');
    });
  });
});