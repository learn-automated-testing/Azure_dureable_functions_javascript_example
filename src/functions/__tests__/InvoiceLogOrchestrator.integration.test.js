const { app } = require('@azure/functions');
const df = require('durable-functions');
const mockInvoice = require('../../../mocks/mock-invoice.json');
const { BlobServiceClient } = require('@azure/storage-blob');
const axios = require('axios');

// Set up Azurite connection string for testing
process.env.AzureWebJobsStorage = 'UseDevelopmentStorage=true';

describe('Invoice Processing Integration Tests', () => {
    let blobServiceClient;
    let containerClient;
    const baseUrl = 'http://localhost:7071/api';

    beforeAll(async () => {
        // Initialize blob service client
        blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AzureWebJobsStorage);
        containerClient = blobServiceClient.getContainerClient('invoices');
        
        // Ensure container exists
        await containerClient.createIfNotExists();
    });

    afterAll(async () => {
        // Clean up test container
        await containerClient.delete();
    });

    beforeEach(async () => {
        // Clear all blobs in the container before each test
        for await (const blob of containerClient.listBlobsFlat()) {
            await containerClient.deleteBlob(blob.name);
        }
    });

    describe('End-to-End Invoice Processing', () => {
        it('should process invoice and generate PDF', async () => {
            // 1. Start the invoice processing
            const startResponse = await axios.post(`${baseUrl}/invoice/start`, mockInvoice);
            
            expect(startResponse.status).toBe(202);
            expect(startResponse.data.id).toBeDefined();
            expect(startResponse.data.status).toBe("Running");
            
            const instanceId = startResponse.data.id;

            // 2. Poll for completion
            let status;
            let attempts = 0;
            const maxAttempts = 10;
            
            while (attempts < maxAttempts) {
                const statusResponse = await axios.get(`${baseUrl}/orchestrators/status/${instanceId}`);
                status = statusResponse.data;
                
                if (status.runtimeStatus === 'Completed' || status.runtimeStatus === 'Failed') {
                    break;
                }
                
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second between polls
                attempts++;
            }

            // 3. Verify the final status
            expect(status.runtimeStatus).toBe('Completed');
            expect(status.output).toBeDefined();
            expect(status.output.success).toBe(true);
            expect(status.output.invoiceData).toEqual(mockInvoice);
            expect(status.output.pdfDetails.blobUrl).toBeDefined();
            expect(status.output.pdfDetails.blobName).toContain(mockInvoice.invoiceId);

            // 4. Verify the PDF was actually created in Azurite
            const blobs = [];
            for await (const blob of containerClient.listBlobsFlat()) {
                blobs.push(blob);
            }
            
            expect(blobs.length).toBe(1);
            expect(blobs[0].name).toContain(mockInvoice.invoiceId);
        });

        it('should handle invalid invoice data', async () => {
            const invalidInvoice = { ...mockInvoice, invoiceId: null };

            // 1. Start the invoice processing with invalid data
            const startResponse = await axios.post(`${baseUrl}/invoice/start`, invalidInvoice);
            
            expect(startResponse.status).toBe(202);
            expect(startResponse.data.id).toBeDefined();
            
            const instanceId = startResponse.data.id;

            // 2. Poll for completion
            let status;
            let attempts = 0;
            const maxAttempts = 10;
            
            while (attempts < maxAttempts) {
                const statusResponse = await axios.get(`${baseUrl}/orchestrators/status/${instanceId}`);
                status = statusResponse.data;
                
                if (status.runtimeStatus === 'Completed' || status.runtimeStatus === 'Failed') {
                    break;
                }
                
                await new Promise(resolve => setTimeout(resolve, 1000));
                attempts++;
            }

            // 3. Verify the error was handled properly
            expect(status.runtimeStatus).toBe('Failed');
            expect(status.output).toBeDefined();
            expect(status.output.success).toBe(false);
            expect(status.output.error).toBeDefined();

            // 4. Verify no PDF was created
            const blobs = [];
            for await (const blob of containerClient.listBlobsFlat()) {
                blobs.push(blob);
            }
            
            expect(blobs.length).toBe(0);
        });
    });
}); 