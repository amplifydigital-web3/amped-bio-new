# Amped Bio Client

## Environment Configuration

### DEMO Mode

The application can be run in DEMO mode which uses mock data instead of actual API calls to the backend server.

To enable DEMO mode, create or update your `.env` or `.env.local` file with:

```
VITE_DEMO_MODE=true
```

When DEMO mode is enabled:
- All tRPC API calls will be intercepted
- Mock data will be returned instead of making real API requests
- A simulated delay (500ms) is added to mimic network latency
- A DEMO mode indicator will appear in the bottom right corner of the application
- The indicator can be used to test various mock API calls
- Console logs will indicate when mock data is being used

#### Benefits of DEMO Mode

- **Development without a backend**: Work on frontend features without needing a running server
- **Demo environments**: Deploy a fully interactive demo that doesn't require a backend
- **Showcasing UI**: Present the application to stakeholders without backend dependencies
- **Testing UI workflows**: Test UI flows and state management independently
- **Consistent responses**: Get predictable API responses for UI development

#### Testing with the DEMO Indicator

The DEMO mode indicator provides an interactive way to test the mock API:

1. You can select from common tRPC endpoints
2. Edit the JSON input for the request
3. Execute the request and see the mock response
4. The indicator can be minimized to reduce screen space

To disable DEMO mode, set `VITE_DEMO_MODE=false` or remove the variable from your environment.

## Authentication in DEMO Mode

In DEMO mode, authentication works as follows:

- Login and register endpoints will store a demo token in localStorage
- The token will be used for any authenticated requests
- You can "log out" by clearing localStorage

## Extending Mock Data

To extend the mock data for new API endpoints, update the `mockData` object in `src/utils/trpc.ts`.

The mock data structure follows this pattern:

```typescript
const mockData = {
  namespace: {
    procedure: {
      // Your mock response data
    },
  },
};
```

For example, to add a new endpoint:

```typescript
mockData.user.newEndpoint = {
  success: true,
  data: {
    // Your mock data here
  }
};
```

## Customizing Mock Behavior

For complex cases where you need custom logic based on the input parameters, you can modify the mock handler in the `createMockLink` function. The handler already supports some dynamic responses based on input.
