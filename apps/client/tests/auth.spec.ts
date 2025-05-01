import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('https://localhost:5173');
  });

  test('should open the auth modal when clicking sign in', async ({ page }) => {
    // Look for sign in button and click it
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Auth modal should be visible
    await expect(page.getByText('Sign in to your account')).toBeVisible();
    await expect(page.getByLabel('Email', { exact: true }).or(page.getByRole('textbox', { name: 'email' }))).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true }).or(page.getByRole('textbox', { name: 'password' }))).toBeVisible();
  });

  test('should switch between login and register forms', async ({ page }) => {
    // Open auth modal
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Switch to register form
    await page.getByText('Create an account').click();
    
    // Check that register form is displayed
    await expect(page.getByText('Create your account')).toBeVisible();
    await expect(page.getByLabel('Amped.Bio Unique URL')).toBeVisible();
    
    // Switch back to login form
    await page.getByText('Already have an account?').click();
    
    // Check that login form is displayed again
    await expect(page.getByText('Sign in to your account')).toBeVisible();
  });

  test('should display validation errors for empty fields', async ({ page }) => {
    // Open auth modal
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Submit form without entering data
    await page.getByRole('button', { name: 'Sign In', exact: true }).filter({ has: page.locator('form') }).click();
    
    // Check validation error messages
    await expect(page.getByText('Email is required')).toBeVisible();
    await expect(page.getByText('Password is required')).toBeVisible();
  });

  test('should display validation error for invalid email format', async ({ page }) => {
    // Open auth modal
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Enter invalid email
    await page.getByLabel('Email', { exact: true }).or(page.getByRole('textbox', { name: 'email' })).fill('invalid-email');
    await page.getByLabel('Email', { exact: true }).or(page.getByRole('textbox', { name: 'email' })).blur();
    
    // Check validation error
    await expect(page.getByText('Invalid email address')).toBeVisible();
  });

  test('should validate registration form fields', async ({ page }) => {
    // Open auth modal
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Switch to register form
    await page.getByText('Create an account').click();
    
    // Submit empty form
    await page.getByRole('button', { name: 'Sign Up', exact: true }).filter({ has: page.locator('form') }).click();
    
    // Check validation errors
    await expect(page.getByText('Email is required')).toBeVisible();
    await expect(page.getByText('Password is required')).toBeVisible();
    await expect(page.getByText('URL is required')).toBeVisible();
  });

  test('should validate password requirements on registration', async ({ page }) => {
    // Open auth modal
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Switch to register form
    await page.getByText('Create an account').click();
    
    // Enter a weak password
    await page.getByLabel('Email', { exact: true }).or(page.getByRole('textbox', { name: 'email' })).fill('test@example.com');
    await page.getByLabel('Password', { exact: true }).or(page.getByRole('textbox', { name: 'password' })).fill('12345');
    await page.getByLabel('Password', { exact: true }).or(page.getByRole('textbox', { name: 'password' })).blur();
    
    // Check password validation error
    await expect(page.getByText('Password must be at least 8 characters')).toBeVisible();
  });

  test('should show forgot password form', async ({ page }) => {
    // Open auth modal
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Click forgot password link
    await page.getByText('Forgot password?').click();
    
    // Verify reset password form is shown
    await expect(page.getByText('Reset your password')).toBeVisible();
    await expect(page.getByLabel('Email', { exact: true }).or(page.getByRole('textbox', { name: 'email' }))).toBeVisible();
  });

  test('should validate email on password reset form', async ({ page }) => {
    // Open auth modal
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Click forgot password link
    await page.getByText('Forgot password?').click();
    
    // Submit empty form
    await page.getByRole('button', { name: 'Send Reset Link' }).click();
    
    // Check validation error
    await expect(page.getByText('Email is required')).toBeVisible();
  });

  test('should check URL availability during registration', async ({ page }) => {
    // Open auth modal
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Switch to register form
    await page.getByText('Create an account').click();
    
    // Type a URL in the URL field
    await page.getByLabel('Amped.Bio Unique URL').fill('test-user');
    
    // Check for URL availability indicator
    await expect(page.getByLabel('URL status indicator')).toBeVisible();
  });

  // Tests that require authentication
  test.describe('Authentication with mock API', () => {
    test.beforeEach(async ({ page }) => {
      // Intercept authentication API requests
      await page.route('**/api/auth/login', async route => {
        await route.fulfill({
          status: 200,
          body: JSON.stringify({
            user: {
              id: '123',
              email: 'test@example.com',
              onelink: 'test-user',
              name: 'Test User'
            },
            token: 'mock-jwt-token'
          })
        });
      });
      
      await page.route('**/api/auth/register', async route => {
        await route.fulfill({
          status: 200,
          body: JSON.stringify({
            user: {
              id: '123',
              email: 'new@example.com',
              onelink: 'new-user',
              name: 'New User'
            },
            token: 'mock-jwt-token'
          })
        });
      });

      await page.goto('/');
    });
    
    test('should handle successful login', async ({ page }) => {
      // Open auth modal
      await page.getByRole('button', { name: 'Sign In' }).click();
      
      // Fill in login form
      await page.getByLabel('Email', { exact: true }).or(page.getByRole('textbox', { name: 'email' })).fill('test@example.com');
      await page.getByLabel('Password', { exact: true }).or(page.getByRole('textbox', { name: 'password' })).fill('password123');
      
      // Submit form
      await page.getByRole('button', { name: 'Sign In', exact: true }).filter({ has: page.locator('form') }).click();
      
      // Check for successful login indication
      await expect(page.getByLabel('User menu')).toBeVisible();
    });
    
    test('should handle successful registration', async ({ page }) => {
      // Open auth modal
      await page.getByRole('button', { name: 'Sign In' }).click();
      
      // Switch to register form
      await page.getByText('Create an account').click();
      
      // Fill in registration form
      await page.getByLabel('Email', { exact: true }).or(page.getByRole('textbox', { name: 'email' })).fill('new@example.com');
      await page.getByLabel('Password', { exact: true }).or(page.getByRole('textbox', { name: 'password' })).fill('password123');
      await page.getByLabel('Amped.Bio Unique URL').fill('new-user');
      
      // Submit form
      await page.getByRole('button', { name: 'Sign Up', exact: true }).filter({ has: page.locator('form') }).click();
      
      // Check for successful registration indication
      await expect(page.getByLabel('User menu')).toBeVisible();
    });
    
    test('should handle login errors', async ({ page }) => {
      // Override the route for error case
      await page.route('**/api/auth/login', async route => {
        await route.fulfill({
          status: 401,
          body: JSON.stringify({
            error: 'Invalid credentials'
          })
        });
      });
      
      // Open auth modal
      await page.getByRole('button', { name: 'Sign In' }).click();
      
      // Fill in login form
      await page.getByLabel('Email', { exact: true }).or(page.getByRole('textbox', { name: 'email' })).fill('test@example.com');
      await page.getByLabel('Password', { exact: true }).or(page.getByRole('textbox', { name: 'password' })).fill('wrong-password');
      
      // Submit form
      await page.getByRole('button', { name: 'Sign In', exact: true }).filter({ has: page.locator('form') }).click();
      
      // Check for error message
      await expect(page.getByText('Invalid credentials')).toBeVisible();
    });
  });
});