// Helper function to generate unique test emails
const generateUniqueEmail = (prefix = "test") => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${randomStr}@example.com`;
};

// Test credentials used for registration, login, and password reset tests
const testUser = {
  email: "",
  password: "",
  onelink: "",
};

describe("Authentication", () => {
  beforeEach(() => {
    cy.visit("/");
  });

  it("should open the auth modal when clicking sign in", () => {
    // Look for sign in button and click it
    cy.contains("button", "Sign In").click();

    // Auth modal should be visible
    cy.get("[data-testid='auth-modal-title']").should("be.visible");
    cy.get("[data-testid='login-email']").should("be.visible");
    cy.get("[data-testid='login-password']").should("be.visible");
  });

  it("should switch between login and register forms", () => {
    // Open auth modal
    cy.contains("button", "Sign In").click();

    // Switch to register form
    cy.get("[data-testid='switch-to-register']").click();

    // Check that register form is displayed
    cy.get("[data-testid='auth-modal-title']").should("have.text", "Sign Up for Free");
    cy.get("[data-testid='register-onelink']").should("be.visible");

    // Switch back to login form
    cy.get("[data-testid='switch-to-login']").click();

    // Check that login form is displayed again
    cy.get("[data-testid='auth-modal-title']").should("have.text", "Sign In");
  });

  it("should display validation errors for empty fields", () => {
    // Open auth modal
    cy.contains("button", "Sign In").click();

    // Trigger validation by focusing and blurring fields
    cy.get("[data-testid='login-email']").click().blur();
    cy.contains("Please enter a valid email address").should("be.visible");

    cy.get("[data-testid='login-password']").click().blur();
    cy.contains("Password must be at least 6 characters long").should("be.visible");
  });

  it("should display validation error for invalid email format", () => {
    // Open auth modal
    cy.contains("button", "Sign In").click();

    // Enter invalid email
    cy.get("[data-testid='login-email']").type("invalid-email");
    // Trigger validation by removing focus
    cy.get("[data-testid='login-email']").blur();

    // Check validation error
    cy.contains("Please enter a valid email address").should("be.visible");
  });

  it("should validate registration form fields", () => {
    // Open auth modal
    cy.contains("button", "Sign In").click();

    // Switch to register form
    cy.get("[data-testid='switch-to-register']").click();

    // Fill and blur each field to trigger validation
    cy.get("[data-testid='register-email']").click().blur();
    cy.get("[data-testid='register-password']").click().blur();
    cy.get("[data-testid='register-onelink']").click().blur();

    cy.contains("Please enter a valid email address").should("be.visible");
    cy.contains("Password must be at least 8 characters long").should("be.visible");
    cy.contains("Name must be at least 3 characters").should("be.visible");
  });

  it("should validate password requirements on registration", () => {
    // Open auth modal
    cy.contains("button", "Sign In").click();
    cy.get("[data-testid='switch-to-register']").click();

    // Enter a weak password
    cy.get("[data-testid='register-email']").type(generateUniqueEmail("validation"));
    cy.get("[data-testid='register-password']").type("12345").blur();
    cy.contains("Password must be at least 8 characters long").should("be.visible");

    // Enter a longer password without uppercase letter
    cy.get("[data-testid='register-password']").clear().type("12345678").blur();
    cy.contains("Password must contain at least one uppercase letter").should("be.visible");

    // Enter a password without a lowercase letter
    cy.get("[data-testid='register-password']").clear().type("12345678A").blur();
    cy.contains("Password must contain at least one lowercase letter").should("be.visible");

    // Enter a password without a number
    cy.get("[data-testid='register-password']").clear().type("PasswordAB").blur();
    cy.contains("Password must contain at least one number").should("be.visible");

    // Enter a strong password that meets all requirements
    cy.get("[data-testid='register-password']").clear().type("Password123").blur();
    cy.contains("Password requirements:").should("be.visible");
    cy.contains("At least 8 characters").should("be.visible");
    cy.contains("At least one uppercase letter").should("be.visible");
    cy.contains("At least one lowercase letter").should("be.visible");
    cy.contains("At least one number").should("be.visible");
  });

  it("should show forgot password form", () => {
    cy.contains("button", "Sign In").click();
    cy.get("[data-testid='forgot-password']").click();
    cy.get("[data-testid='auth-modal-title']").should("have.text", "Reset Password");
    cy.contains("Enter your email address below").should("be.visible");
    cy.get("[data-testid='reset-email']").should("be.visible");
    cy.get("[data-testid='reset-submit']").should("be.visible");
  });

  it("should validate email on password reset form", () => {
    cy.contains("button", "Sign In").click();
    cy.get("[data-testid='forgot-password']").click();
    cy.get("[data-testid='reset-email']").click().blur();
    cy.get("[data-testid='reset-submit']").click();
    cy.contains("Please enter a valid email address").should("be.visible");
  });

  it("should check URL availability during registration", () => {
    cy.contains("button", "Sign In").click();
    cy.get("[data-testid='switch-to-register']").click();
    cy.get("[data-testid='register-onelink']").type("test-user");
    cy.get("[data-testid='public-url-preview']")
      .should("be.visible")
      .and("contain.text", "Public URL:");
  });

  describe("Authentication with real API", () => {
    before(() => {
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 8);
      testUser.email = `test-integrated-${timestamp}-${randomStr}@example.com`;
      testUser.onelink = `test-user-${timestamp}-${randomStr}`;
      testUser.password = "Password123@";
      cy.log(`Using test credentials - Email: ${testUser.email}, Onelink: ${testUser.onelink}`);
    });

    it("should handle successful registration and redirect to dashboard", () => {
      cy.log(`Starting registration with email: ${testUser.email}`);
      cy.contains("button", "Sign In").click();
      cy.get("[data-testid='switch-to-register']").click();

      cy.get("[data-testid='register-onelink']").type(testUser.onelink);
      cy.get("[data-testid='register-email']").type(testUser.email);
      cy.get("[data-testid='register-password']").type(testUser.password);

      cy.log(`Submitting registration with: ${testUser.email}, ${testUser.onelink}`);
      cy.get("[data-testid='register-submit']").click();

      cy.url().should("match", new RegExp(`/@${testUser.onelink}/edit`), { timeout: 10000 });
      cy.contains("span", "Home", { timeout: 10000 }).should("be.visible");
      cy.log(`Registration complete for: ${testUser.email}`);
    });

    it("should handle successful login and redirect to dashboard", () => {
      cy.log(`Starting login with email: ${testUser.email}`);
      cy.contains("button", "Sign In").click();

      cy.get("[data-testid='login-email']").type(testUser.email);
      cy.get("[data-testid='login-password']").type(testUser.password);

      cy.log(`Submitting login with: ${testUser.email}`);
      cy.get("[data-testid='login-submit']").click();

      cy.url().should("match", new RegExp(`/@${testUser.onelink}/edit`), { timeout: 10000 });
      cy.contains("span", "Home", { timeout: 10000 }).should("be.visible");
      cy.log(`Login successful for: ${testUser.email}`);
    });

    it("should handle password reset request", () => {
      cy.log(`Starting password reset with email: ${testUser.email}`);
      cy.contains("button", "Sign In").click();
      cy.get("[data-testid='forgot-password']").click();
      cy.get("[data-testid='auth-modal-title']").should("have.text", "Reset Password");

      cy.get("[data-testid='reset-email']").type(testUser.email);
      cy.log(`Submitting password reset for: ${testUser.email}`);
      cy.get("[data-testid='reset-submit']").click();

      cy.contains("Instructions to reset your password have been sent to your email", {
        timeout: 5000,
      }).should("be.visible");
      cy.get("[data-testid='auth-modal']").should("be.visible");
      cy.log(`Password reset requested for: ${testUser.email}`);
    });

    it("should handle login errors", () => {
      const nonexistentEmail = generateUniqueEmail("nonexistent");
      cy.contains("button", "Sign In").click();

      cy.get("[data-testid='login-email']").type(nonexistentEmail);
      cy.get("[data-testid='login-password']").type("wrong-password");
      cy.get("[data-testid='login-submit']").click();

      cy.contains(/Invalid credentials|Invalid email or password|Authentication failed/, {
        timeout: 5000,
      }).should("be.visible");
      cy.get("[data-testid='auth-modal-title']").should("have.text", "Sign In");
    });
  });
});
