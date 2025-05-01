/// <reference types="cypress" />
describe('Authentication', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('should open the auth modal when clicking sign in', () => {
    // Look for sign in button and click it
    cy.contains('button', 'Sign In').click();
    
    // Auth modal should be visible
    cy.contains('Sign in to your account').should('be.visible');
    cy.get('input[name="email"]').should('be.visible');
    cy.get('input[name="password"]').should('be.visible');
  });

  it('should switch between login and register forms', () => {
    // Open auth modal
    cy.contains('button', 'Sign In').click();
    
    // Switch to register form
    cy.contains('Create an account').click();
    
    // Check that register form is displayed
    cy.contains('Create your account').should('be.visible');
    cy.get('input[aria-label="Amped.Bio Unique URL"]').should('be.visible');
    
    // Switch back to login form
    cy.contains('Already have an account?').click();
    
    // Check that login form is displayed again
    cy.contains('Sign in to your account').should('be.visible');
  });

  it('should display validation errors for empty fields', () => {
    // Open auth modal
    cy.contains('button', 'Sign In').click();
    
    // Submit form without entering data
    cy.get('form').contains('button', 'Sign In').click();
    
    // Check validation error messages
    cy.contains('Email is required').should('be.visible');
    cy.contains('Password is required').should('be.visible');
  });

  it('should display validation error for invalid email format', () => {
    // Open auth modal
    cy.contains('button', 'Sign In').click();
    
    // Enter invalid email
    cy.get('input[name="email"]').type('invalid-email');
    cy.get('input[name="email"]').blur();
    
    // Check validation error
    cy.contains('Invalid email address').should('be.visible');
  });

  it('should validate registration form fields', () => {
    // Open auth modal
    cy.contains('button', 'Sign In').click();
    
    // Switch to register form
    cy.contains('Create an account').click();
    
    // Submit empty form
    cy.get('form').contains('button', 'Sign Up').click();
    
    // Check validation errors
    cy.contains('Email is required').should('be.visible');
    cy.contains('Password is required').should('be.visible');
    cy.contains('URL is required').should('be.visible');
  });

  it('should validate password requirements on registration', () => {
    // Open auth modal
    cy.contains('button', 'Sign In').click();
    
    // Switch to register form
    cy.contains('Create an account').click();
    
    // Enter a weak password
    cy.get('input[name="email"]').type('test@example.com');
    cy.get('input[name="password"]').type('12345');
    cy.get('input[name="password"]').blur();
    
    // Check password validation error
    cy.contains('Password must be at least 8 characters').should('be.visible');
  });

  it('should show forgot password form', () => {
    // Open auth modal
    cy.contains('button', 'Sign In').click();
    
    // Click forgot password link
    cy.contains('Forgot password?').click();
    
    // Verify reset password form is shown
    cy.contains('Reset your password').should('be.visible');
    cy.get('input[name="email"]').should('be.visible');
  });

  it('should validate email on password reset form', () => {
    // Open auth modal
    cy.contains('button', 'Sign In').click();
    
    // Click forgot password link
    cy.contains('Forgot password?').click();
    
    // Submit empty form
    cy.contains('button', 'Send Reset Link').click();
    
    // Check validation error
    cy.contains('Email is required').should('be.visible');
  });

  it('should check URL availability during registration', () => {
    // Open auth modal
    cy.contains('button', 'Sign In').click();
    
    // Switch to register form
    cy.contains('Create an account').click();
    
    // Type a URL in the URL field
    cy.get('input[aria-label="Amped.Bio Unique URL"]').type('test-user');
    
    // Check for URL availability indicator
    cy.get('[aria-label="URL status indicator"]').should('exist');
  });

  // Tests that require authentication
  describe('Authentication with mock API', () => {
    beforeEach(() => {
      // Intercept authentication API requests
      cy.intercept('POST', '**/api/auth/login', {
        statusCode: 200,
        body: {
          user: {
            id: '123',
            email: 'test@example.com',
            onelink: 'test-user',
            name: 'Test User'
          },
          token: 'mock-jwt-token'
        }
      }).as('loginRequest');
      
      cy.intercept('POST', '**/api/auth/register', {
        statusCode: 200,
        body: {
          user: {
            id: '123',
            email: 'new@example.com',
            onelink: 'new-user',
            name: 'New User'
          },
          token: 'mock-jwt-token'
        }
      }).as('registerRequest');
    });
    
    it('should handle successful login', () => {
      // Open auth modal
      cy.contains('button', 'Sign In').click();
      
      // Fill in login form
      cy.get('input[name="email"]').type('test@example.com');
      cy.get('input[name="password"]').type('password123');
      
      // Submit form
      cy.get('form').contains('button', 'Sign In').click();
      
      // Wait for API call
      cy.wait('@loginRequest');
      
      // Check for successful login indication
      cy.get('[aria-label="User menu"]').should('exist');
    });
    
    it('should handle successful registration', () => {
      // Open auth modal
      cy.contains('button', 'Sign In').click();
      
      // Switch to register form
      cy.contains('Create an account').click();
      
      // Fill in registration form
      cy.get('input[name="email"]').type('new@example.com');
      cy.get('input[name="password"]').type('password123');
      cy.get('input[aria-label="Amped.Bio Unique URL"]').type('new-user');
      
      // Submit form
      cy.get('form').contains('button', 'Sign Up').click();
      
      // Wait for API call
      cy.wait('@registerRequest');
      
      // Check for successful registration indication
      cy.get('[aria-label="User menu"]').should('exist');
    });
    
    it('should handle login errors', () => {
      // Override the intercept for error case
      cy.intercept('POST', '**/api/auth/login', {
        statusCode: 401,
        body: {
          error: 'Invalid credentials'
        }
      }).as('failedLoginRequest');
      
      // Open auth modal
      cy.contains('button', 'Sign In').click();
      
      // Fill in login form
      cy.get('input[name="email"]').type('test@example.com');
      cy.get('input[name="password"]').type('wrong-password');
      
      // Submit form
      cy.get('form').contains('button', 'Sign In').click();
      
      // Wait for API call
      cy.wait('@failedLoginRequest');
      
      // Check for error message
      cy.contains('Invalid credentials').should('be.visible');
    });
  });
});