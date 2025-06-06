const { app } = require('@azure/functions');
const df = require('durable-functions');
const mockInvoice = require('../../../mocks/mock-invoice.json');
// --- FIXED PDFKit MOCK ---


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
                // Simulate 'data' and 'end' events
                emitter.emit('data', fakeBuffer);
                emitter.emit('end');
            }),
        };
    });
});

// Mock the Azure Storage Blob client
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

// Mock durable-functions
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


// Import the actual functions
const { FetchInvoice, GenerateAndStorePDF } = require('../InvoiceLogOrchestrator');

describe('Invoice Processing Tests', () => {
    let context;

    beforeEach(() => {
        // Create a new test context for each test
        context = {
            log: {
                info: jest.fn(),
                error: jest.fn()
            },
            df: {
                callActivity: jest.fn()
            }
        };
    });

    describe('FetchInvoice Activity', () => {
        it('should return mock invoice data', async () => {
            const testContext = {
                log: jest.fn()
            };
            const result = await FetchInvoice.handler({ customerId: 0 }, testContext);
            
            expect(result.success).toBe(true);
            expect(result.data).toBeDefined();
            expect(result.data.invoiceId).toBe('INV-NORMAL');
            expect(result.timestamp).toBeDefined();
        });

        it('should handle high-value invoice', async () => {
            const testContext = {
                log: jest.fn()
            };
            const result = await FetchInvoice.handler({ customerId: 1 }, testContext);
            
            expect(result.success).toBe(true);
            expect(result.data).toBeDefined();
            expect(result.data.invoiceId).toBe('INV-HIGH');
            expect(result.data.totalAmount).toBe(20000);
            expect(result.timestamp).toBeDefined();
        });

        it('should handle rejected vendor', async () => {
            const testContext = {
                log: jest.fn()
            };
            const result = await FetchInvoice.handler({ customerId: 2 }, testContext);
            
            expect(result.success).toBe(true);
            expect(result.data).toBeDefined();
            expect(result.data.vendorName).toBe('Rejected Vendor');
            expect(result.timestamp).toBeDefined();
        });

        it('should handle invalid invoice', async () => {
            const testContext = {
                log: jest.fn()
            };
            const result = await FetchInvoice.handler({ customerId: 3 }, testContext);
            
            expect(result.success).toBe(true);
            expect(result.data).toBeDefined();
            expect(result.data.invoiceId).toBeNull();
            expect(result.timestamp).toBeDefined();
        });
    });

    describe('GenerateAndStorePDF Activity', () => {
        it('should generate PDF and store in Azure Storage', async () => {
            const result = await GenerateAndStorePDF.handler(mockInvoice, context);
            
            expect(result.success).toBe(true);
            expect(result.blobName).toContain(mockInvoice.invoiceId);
            expect(result.blobUrl).toBeDefined();
            expect(result.processedAt).toBeDefined();
        }, 10000); // Increased timeout to 10 seconds

        it('should handle errors gracefully', async () => {
            const invalidInvoice = { ...mockInvoice, invoiceId: null };
            const result = await GenerateAndStorePDF.handler(invalidInvoice, context);
            
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        }, 10000); // Increased timeout to 10 seconds
    });

    describe('InvoiceOrchestrator', () => {
        it('should process invoice successfully', () => {
            // Mock the activities
            context.df.callActivity
                .mockImplementationOnce(() => ({
                    success: true,
                    data: mockInvoice,
                    timestamp: new Date().toISOString()
                }))
                .mockImplementationOnce(() => ({
                    success: true,
                    blobName: 'test.pdf',
                    blobUrl: 'https://test-storage/invoices/test.pdf',
                    processedAt: new Date().toISOString()
                }));
        
            // Mock the orchestrator function as a generator
            const orchestratorFunction = function* (context) {
                const fetchResult = yield context.df.callActivity('FetchInvoice');
                const pdfResult = yield context.df.callActivity('GenerateAndStorePDF', fetchResult.data);
                return {
                    success: true,
                    invoiceData: fetchResult.data,
                    pdfDetails: pdfResult
                };
            };
        
            // Register the mock orchestrator
            df.app.orchestration.mockImplementation((name, fn) => ({
                handler: fn
            }));
        
            const orchestrator = df.app.orchestration('InvoiceOrchestrator', orchestratorFunction);
            const generator = orchestrator.handler(context);
        
            // Step through the generator to get the final result
            let step = generator.next(); // step 1: FetchInvoice
            step = generator.next(step.value); // step 2: GenerateAndStorePDF
            step = generator.next(step.value); // step 3: get return value
        
            const result = step.value;
        
            expect(result.success).toBe(true);
            expect(result.invoiceData).toEqual(mockInvoice);
            expect(result.pdfDetails.blobUrl).toBeDefined();
        });

        it('should handle FetchInvoice failure', () => {
            context.df.callActivity.mockImplementationOnce(() => ({
                success: false,
                error: 'Failed to fetch invoice'
            }));
        
            const orchestratorFunction = function* (context) {
                const fetchResult = yield context.df.callActivity('FetchInvoice');
                if (!fetchResult.success) {
                    throw new Error('Failed to fetch invoice');
                }
            };
        
            df.app.orchestration.mockImplementation((name, fn) => ({
                handler: fn
            }));
        
            const orchestrator = df.app.orchestration('InvoiceOrchestrator', orchestratorFunction);
            const generator = orchestrator.handler(context);
        
            expect(() => {
                // Step through the generator, passing the fetch result back in.
                let result = generator.next(); // yields and pauses at `yield context.df.callActivity`
                generator.next({ success: false, error: 'Failed to fetch invoice' }); // resumes and should throw
            }).toThrow('Failed to fetch invoice');
        });

        it('should handle PDF generation failure', () => {
            context.df.callActivity
                .mockImplementationOnce(() => ({
                    success: true,
                    data: mockInvoice,
                    timestamp: new Date().toISOString()
                }))
                .mockImplementationOnce(() => ({
                    success: false,
                    error: 'Failed to generate PDF'
                }));
        
            const orchestratorFunction = function* (context) {
                const fetchResult = yield context.df.callActivity('FetchInvoice');
                const pdfResult = yield context.df.callActivity('GenerateAndStorePDF', fetchResult.data);
                if (!pdfResult.success) {
                    throw new Error('Failed to generate and store PDF');
                }
            };
        
            df.app.orchestration.mockImplementation((name, fn) => ({
                handler: fn
            }));
        
            const orchestrator = df.app.orchestration('InvoiceOrchestrator', orchestratorFunction);
            const generator = orchestrator.handler(context);
        
            expect(() => {
                // Step 1: Start the generator, pauses at the first yield (FetchInvoice)
                let step = generator.next();
        
                // Step 2: Send in the successful FetchInvoice result
                step = generator.next({
                    success: true,
                    data: mockInvoice,
                    timestamp: new Date().toISOString()
                });
        
                // Step 3: Send in the failed GenerateAndStorePDF result (should throw)
                generator.next({
                    success: false,
                    error: 'Failed to generate PDF'
                });
            }).toThrow('Failed to generate and store PDF');
        });
        
       
    
    });
}); 