# Azure Durable Functions Integration Testing Exercise

This exercise focuses on fixing integration tests for an Azure Durable Functions application that processes invoices. The tests are currently failing due to incorrect assertions, and your task is to fix them.

## Prerequisites

- Node.js (v14 or later)
- Azure Functions Core Tools
- Azurite (for local storage emulation)
- Jest (for testing)

## Getting Started

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start Azurite:
   ```bash
   azurite --silent
   ```
4. Start the Azure Functions runtime:
   ```bash
   npm start
   ```
5. Run the tests:
   ```bash
   npm test
   ```

## Running Tests in GitHub Actions

To run the tests in GitHub Actions, you need to:

1. Start Azurite in the background:
   ```yaml
   - name: Start Azurite
     run: |
       npm install -g azurite
       azurite --silent &
   ```

2. Start the Azure Functions runtime in the background:
   ```yaml
   - name: Start Azure Functions Runtime
     run: |
       npm install -g azure-functions-core-tools@4
       func start --no-build --port 7071 &
   ```

3. Wait for the Functions runtime to be ready:
   ```yaml
   - name: Wait for Functions Runtime
     run: |
       timeout 30s bash -c 'until curl -s http://localhost:7071/api/health; do sleep 1; done'
   ```

4. Run the tests:
   ```yaml
   - name: Run Tests
     run: npm test -- --testPathPattern=integration
   ```

## Troubleshooting

If you see connection errors like:
```
AggregateError:
  at Function.Object.<anonymous>.AxiosError.from
  at RedirectableRequest.handleRequestError
```

Check the following:

1. Is the Azure Functions runtime running?
   ```bash
   # Check if the runtime is running
   curl http://localhost:7071/api/health
   ```

2. Is the port correct?
   - The tests use port 7071 by default
   - If your Functions runtime uses a different port, update the `baseUrl` in the tests

3. Is Azurite running?
   ```bash
   # Check if Azurite is running
   curl http://localhost:10000/devstoreaccount1
   ```

4. Are all environment variables set?
   ```bash
   # Check environment variables
   echo $AzureWebJobsStorage
   ```

## Exercise Tasks

### 1. Fix Test Assertions

The integration tests are failing due to incorrect assertions. Your task is to fix them by understanding the actual behavior of the system. Here are the main issues to address:

#### Normal Invoice Test
- HTTP status code should be 202 (Accepted), not 200
- Success flag should be true for successful processing
- Only one blob should be created
- Blob name should contain 'INV-NORMAL'

#### High-Value Invoice Test
- Runtime status should be 'Completed', not 'Failed'
- Approval result should be defined and contain approval information
- Total amount should be 20000, not 10000
- Blob name should contain 'INV-HIGH'

#### Rejected Vendor Test
- Runtime status should be 'Completed', not 'Failed'
- Success flag should be false for rejected invoices
- Approval result should be defined
- Reason should be 'Not approved', not 'Approved'
- No blobs should be created

#### Invalid Invoice Test
- Output should be defined
- Success flag should be false
- Error information should be present
- No blobs should be created

#### Missing CustomerId Test
- Runtime status should be 'Completed', not 'Failed'
- Success flag should be true
- Invoice ID should be 'INV-NORMAL', not 'INV-HIGH'
- One blob should be created

#### Malformed Request Test
- Runtime status should be 'Completed', not 'Failed'
- Success flag should be true
- Invoice ID should be 'INV-NORMAL', not 'INV-HIGH'
- One blob should be created

### 2. Add Missing Test Cases

Add the following test cases:

1. Concurrent Invoice Processing
   - Test multiple simultaneous invoice requests
   - Verify all invoices are processed correctly
   - Check for any race conditions

2. Retry Behavior
   - Test automatic retries for failed operations
   - Verify retry limits and delays
   - Check retry success scenarios

3. Timeout Handling
   - Test long-running operations
   - Verify timeout limits
   - Check timeout recovery

## Tips

- Use the Azure Functions Core Tools to debug your functions
- Check the Azurite logs for storage-related issues
- Use Jest's `--verbose` flag for detailed test output
- Consider using `jest --watch` for development

## Resources

- [Azure Durable Functions Documentation](https://docs.microsoft.com/en-us/azure/azure-functions/durable/durable-functions-overview)
- [Azurite Documentation](https://github.com/Azure/Azurite)
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Azure Functions Testing Best Practices](https://docs.microsoft.com/en-us/azure/azure-functions/functions-test-a-function)

## Expected Test Output

After fixing all assertions, running `npm test` should show:

```
 PASS  src/functions/__tests__/InvoiceLogOrchestrator.integration.test.js
  Invoice Processing Integration Tests
    End-to-End Invoice Processing
      ✓ should process a normal invoice (customerId: 0) and generate PDF
      ✓ should process high-value invoice (customerId: 1) with approval and generate PDF
      ✓ should reject invoice from rejected vendor (customerId: 2)
      ✓ should handle invalid invoice data (customerId: 3)
      ✓ should handle missing customerId gracefully
      ✓ should handle malformed request body by defaulting to normal invoice
      ✓ should handle concurrent invoice processing
      ✓ should handle retry behavior
      ✓ should handle timeout scenarios

Test Suites: 1 passed, 1 total
Tests:       9 passed, 9 total
```