# Azure Durable Functions Integration Testing Tasks

This repository contains an Azure Durable Functions application for processing invoices. Your task is to fix and improve the integration tests to ensure proper functionality.

## Prerequisites

- Node.js (v14 or later)
- Azure Functions Core Tools
- Azurite (for local storage emulation)
- Jest (for testing)

## Tasks and Solutions

### 1. Setup and Configuration
- [ ] Fix the Azurite connection string in the integration tests
  ```javascript
  // Solution: Update the connection string to use Azurite's default ports
  const connectionString = 'DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;QueueEndpoint=http://127.0.0.1:10001/devstoreaccount1;TableEndpoint=http://127.0.0.1:10002/devstoreaccount1';
  ```

- [ ] Update the base URL to match your local Azure Functions runtime
  ```javascript
  // Solution: Update the base URL to match your local runtime port
  const baseUrl = 'http://localhost:7071';
  ```

- [ ] Add proper error handling for container operations
  ```javascript
  // Solution: Add try-catch blocks and proper error handling
  try {
    await containerClient.createIfNotExists();
  } catch (error) {
    console.error('Failed to create container:', error);
    throw new Error(`Container operation failed: ${error.message}`);
  }
  ```

### 2. Test Infrastructure
- [ ] Improve the polling logic in `waitForCompletion`
  ```javascript
  // Solution: Add better timeout handling and exponential backoff
  let delay = initialDelay;
  delay = Math.min(delay * 1.5, 5000); // Exponential backoff with max 5s
  if (result.runtimeStatus === 'Failed') {
    throw new Error(`Orchestration failed: ${result.output}`);
  }
  ```

- [ ] Add retry logic for blob operations
  ```javascript
  // Solution: Implement retry logic with exponential backoff
  let retries = 0;
  let delay = initialDelay;
  while (retries < maxRetries) {
    try {
      return await operation();
    } catch (error) {
      retries++;
      if (retries === maxRetries) throw error;
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
  ```

### 3. Test Cases
- [ ] Normal Invoice Test
  ```javascript
  // Solution: Add comprehensive validation
  const pdfContent = await getPdfContent(result.output.pdfUrl);
  expect(pdfContent).toContain('Invoice');
  expect(result.output.metadata).toMatchObject({
    customerId: expect.any(String),
    amount: expect.any(Number),
    status: 'APPROVED'
  });
  ```

- [ ] High-Value Invoice Test
  ```javascript
  // Solution: Add approval flow testing
  expect(result.output.status).toBe('PENDING_APPROVAL');
  expect(result.output.approvalRequestedAt).toBeDefined();
  await fetch(`${baseUrl}/api/invoice/approve/${id}`, {
    method: 'POST',
    body: JSON.stringify({ approved: true })
  });
  expect(finalResult.output.status).toBe('APPROVED');
  ```

- [ ] Rejected Vendor Test
  ```javascript
  // Solution: Add rejection flow testing
  expect(result.output.status).toBe('REJECTED');
  expect(result.output.rejectionReason).toBeDefined();
  expect(result.output.notificationSent).toBe(true);
  ```

### 4. Additional Test Cases
- [ ] Concurrent Processing Test
  ```javascript
  // Solution: Add concurrent processing test
  const promises = invoiceIds.map(id => 
    fetch(`${baseUrl}/api/invoice/start`, {
      method: 'POST',
      body: JSON.stringify({ invoiceId: id })
    })
  );
  const results = await Promise.all(
    responses.map(r => r.json())
      .map(({ id }) => waitForCompletion(id))
  );
  ```

- [ ] Retry Behavior Test
  ```javascript
  // Solution: Add retry behavior test
  jest.spyOn(global, 'fetch').mockImplementationOnce(() => {
    throw new Error('Temporary failure');
  });
  expect(result.output.retryCount).toBeGreaterThan(0);
  ```

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