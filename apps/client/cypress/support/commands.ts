/// <reference types="cypress" />

// ***********************************************
// This file can be used to create custom commands
// and overwrite existing commands.
// ***********************************************

import '@testing-library/cypress/add-commands';

// Cypress Testing Library adds useful commands
// like cy.findByText(), cy.findByRole(), etc.

Cypress.Commands.add('login', (email: string, password: string) => {
  // Visit the home page
  cy.visit('/');
  
  // Find and click the user menu to open auth modal
  cy.get('button').contains('Sign In').click();
  
  // Fill in login form
  cy.get('input[name="email"]').type(email);
  cy.get('input[name="password"]').type(password);
  
  // Submit the form
  cy.get('button[type="submit"]').contains('Sign In').click();
});

// Command to check if a user is logged in
Cypress.Commands.add('isLoggedIn', () => {
  cy.get('button').contains('Account').should('exist');
});

// Command to navigate to editor page
Cypress.Commands.add('goToEditor', () => {
  cy.get('a').contains('Edit Page').click();
});

declare global {
  namespace Cypress {
    interface Chainable {
      login(email: string, password: string): Chainable<void>
      isLoggedIn(): Chainable<void>
      goToEditor(): Chainable<void>
    }
  }
}