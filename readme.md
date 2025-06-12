# Azure Durable Functions JavaScript Example

This project demonstrates the implementation of Azure Durable Functions using JavaScript, focusing on an invoice processing workflow. The project includes both unit tests and integration tests to ensure the reliability of the invoice processing system.

## Project Overview

The project implements an invoice processing system using Azure Durable Functions with the following main components:

- Invoice Processing Orchestrator
- PDF Generation and Storage
- Invoice Validation
- Approval Workflow for High-Value Invoices

## Test Structure

The project includes two types of tests:

### 1. Unit Tests (`InvoiceLogOrchestrator.test.js`)
Tests individual components of the system:
- FetchInvoice Activity
  - Normal invoice data retrieval
  - High-value invoice handling
  - Rejected vendor scenarios
  - Invalid invoice handling
- GenerateAndStorePDF Activity
  - PDF generation and storage
  - Error handling
- InvoiceOrchestrator
  - Successful invoice processing
  - Failure handling scenarios

### 2. Integration Tests (`InvoiceLogOrchestrator.integration.test.js`)
End-to-end tests covering complete workflows:
- Normal invoice processing (customerId: 0)
- High-value invoice processing with approval (customerId: 1)
- Rejected vendor scenario (customerId: 2)
- Invalid invoice data handling (customerId: 3)
- Missing customerId handling
- Malformed request body handling

## Running Tests

### Prerequisites
- Node.js installed
- Azure Functions Core Tools
- Azure Storage Emulator (Azurite) for local development

### Installation
```bash
npm install
```

### Running All Tests
```bash
npm test
```

### Running Only Integration Tests
```bash
npm test -- InvoiceLogOrchestrator.integration.test.js
```

### Running Only Unit Tests
```bash
npm test -- InvoiceLogOrchestrator.test.js
```

## Project Structure

```
├── functions/
│   ├── __tests__/
│   │   ├── InvoiceLogOrchestrator.test.js
│   │   └── InvoiceLogOrchestrator.integration.test.js
│   ├── InvoiceLogisticsOrchestrator.js
│   ├── ValidateInvoice.js
│   ├── ExtractInvoiceData.js
│   └── ArchiveDocument.js
├── src/
├── mocks/
└── shared/
```

## Key Features

1. **Invoice Processing Workflow**
   - Automated invoice data extraction
   - Validation and approval processes
   - PDF generation and storage
   - Error handling and retry mechanisms

2. **Testing Approach**
   - Unit tests for individual components
   - Integration tests for end-to-end workflows
   - Mock implementations for external dependencies
   - Comprehensive error scenario coverage

## Best Practices Demonstrated

1. **Testing**
   - Separation of unit and integration tests
   - Mock implementations for external services
   - Error scenario coverage
   - End-to-end workflow testing

2. **Code Organization**
   - Modular function design
   - Clear separation of concerns
   - Reusable components
   - Error handling patterns

## Contributing

When contributing to this project:
1. Write tests for new features
2. Maintain or improve test coverage
3. Follow the existing testing patterns
4. Document any new test scenarios

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Testing Strategy

### Mocking Approach

The project uses Jest's mocking capabilities to isolate and test different components of the system. Here's how mocks are implemented for each component:

#### 1. PDF Generation Mock
```javascript
jest.mock('pdfkit', () => {
    return jest.fn().mockImplementation(() => {
        const { EventEmitter } = require('events');
        const emitter = new EventEmitter();
        const fakeBuffer = Buffer.from('FAKE PDF DATA');
        return {
            fontSize: jest.fn().mockReturnThis(),
            text: jest.fn().mockReturnThis(),
            moveDown: jest.fn().mockReturnThis(),
            on: emitter.on.bind(emitter),
            end: jest.fn(() => {
                emitter.emit('data', fakeBuffer);
                emitter.emit('end');
            }),
        };
    });
});
```
This mock simulates PDF generation without actually creating PDF files, making tests faster and more reliable.

#### 2. Azure Storage Mock
```javascript
jest.mock('@azure/storage-blob', () => ({
    BlobServiceClient: {
        fromConnectionString: jest.fn().mockReturnValue({
            getContainerClient: jest.fn().mockReturnValue({
                createIfNotExists: jest.fn(),
                getBlockBlobClient: jest.fn().mockReturnValue({
                    upload: jest.fn(),
                    url: 'https://test-storage/invoices/test.pdf'
                })
            })
        })
    }
}));
```
This mock simulates Azure Blob Storage operations without requiring actual Azure storage access.

#### 3. Durable Functions Mock
```javascript
jest.mock('durable-functions', () => ({
    app: {
        activity: jest.fn(),
        orchestration: jest.fn()
    },
    input: {
        durableClient: jest.fn()
    },
    getClient: jest.fn()
}));
```
This mock simulates the Durable Functions runtime, allowing testing of orchestrations without the actual Azure Functions runtime.

### Mock Data

The project includes mock data in `mocks/mock-invoice.json` that simulates different invoice scenarios:
- Normal invoices
- High-value invoices
- Rejected vendor invoices
- Invalid invoices

### Test Scenarios

Each component is tested with different scenarios using the mock implementations:

1. **FetchInvoice Activity Tests**
   - Normal invoice retrieval
   - High-value invoice handling
   - Rejected vendor scenarios
   - Invalid invoice handling

2. **GenerateAndStorePDF Activity Tests**
   - PDF generation success
   - Storage operation success
   - Error handling for invalid data
   - Error handling for storage failures

3. **Orchestrator Tests**
   - Complete successful workflow
   - Handling of FetchInvoice failures
   - Handling of PDF generation failures
   - Error propagation and recovery

### Integration Test Mocks

Integration tests use a combination of mocks and real implementations to test end-to-end workflows:
- Mock external services (PDF generation, storage)
- Real function implementations
- Simulated Azure Functions runtime
- Mock HTTP requests and responses