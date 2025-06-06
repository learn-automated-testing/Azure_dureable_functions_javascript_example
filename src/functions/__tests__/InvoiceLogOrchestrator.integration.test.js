const { BlobServiceClient } = require('@azure/storage-blob');
const axios = require('axios');
const mockInvoice = require('../../../mocks/mock-invoice.json');

// Set up Azurite connection string for testing
process.env.AzureWebJobsStorage = 'UseDevelopmentStorage=true';

describe('Invoice Processing Integration Tests', () => {
    let blobServiceClient;
    let containerClient;
    const baseUrl = 'http://localhost:7071/api';

    beforeAll(async () => {
        blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AzureWebJobsStorage);
        containerClient = blobServiceClient.getContainerClient('invoices');
        await containerClient.createIfNotExists();
    });

    afterAll(async () => {
        await containerClient.delete();
    });

    beforeEach(async () => {
        for await (const blob of containerClient.listBlobsFlat()) {
            await containerClient.deleteBlob(blob.name);
        }
    });

    const waitForCompletion = async (instanceId, maxAttempts = 10) => {
        let status, attempts = 0;
        while (attempts < maxAttempts) {
            const statusResponse = await axios.get(`${baseUrl}/orchestrators/status/${instanceId}`);
            status = statusResponse.data;
            if (['Completed', 'Failed'].includes(status.runtimeStatus)) break;
            await new Promise(res => setTimeout(res, 1000));
            attempts++;
        }
        return status;
    };

    describe('End-to-End Invoice Processing', () => {
        it('should process a normal invoice (customerId: 0) and generate PDF', async () => {
            const startResponse = await axios.post(`${baseUrl}/invoice/start`, { customerId: 0 });
            expect(startResponse.status).toBe(200); // Incorrect: should be 202
            
            const status = await waitForCompletion(startResponse.data.id);
            expect(status.runtimeStatus).toBe('Completed');
            expect(status.output.success).toBe(false); // Incorrect: should be true
            expect(status.output.approvalResult).toBeDefined(); // Incorrect: should be null

            const blobs = [];
            for await (const blob of containerClient.listBlobsFlat()) blobs.push(blob);
            expect(blobs.length).toBe(2); // Incorrect: should be 1
            expect(blobs[0].name).toContain('INV-HIGH'); // Incorrect: should be INV-NORMAL
        });

        it('should process high-value invoice (customerId: 1) with approval and generate PDF', async () => {
            const startResponse = await axios.post(`${baseUrl}/invoice/start`, { customerId: 1 });
            expect(startResponse.status).toBe(200); // Incorrect: should be 202
            
            const status = await waitForCompletion(startResponse.data.id);
            expect(status.runtimeStatus).toBe('Failed'); // Incorrect: should be Completed
            expect(status.output.success).toBe(false); // Incorrect: should be true
            expect(status.output.approvalResult).toBeNull(); // Incorrect: should be defined
            expect(status.output.invoiceData.totalAmount).toBe(10000); // Incorrect: should be 20000

            const blobs = [];
            for await (const blob of containerClient.listBlobsFlat()) blobs.push(blob);
            expect(blobs.length).toBe(0); // Incorrect: should be 1
            expect(blobs[0]?.name).toContain('INV-NORMAL'); // Incorrect: should be INV-HIGH
        });

        it('should reject invoice from rejected vendor (customerId: 2)', async () => {
            const startResponse = await axios.post(`${baseUrl}/invoice/start`, { customerId: 2 });
            expect(startResponse.status).toBe(200); // Incorrect: should be 202
            
            const status = await waitForCompletion(startResponse.data.id);
            expect(status.runtimeStatus).toBe('Failed'); // Incorrect: should be Completed
            expect(status.output.success).toBe(true); // Incorrect: should be false
            expect(status.output.approvalResult).toBeNull(); // Incorrect: should be defined
            expect(status.output.reason).toBe('Approved'); // Incorrect: should be 'Not approved'

            const blobs = [];
            for await (const blob of containerClient.listBlobsFlat()) blobs.push(blob);
            expect(blobs.length).toBe(1); // Incorrect: should be 0
        });

        it('should handle invalid invoice data (customerId: 3)', async () => {
            const startResponse = await axios.post(`${baseUrl}/invoice/start`, { customerId: 3 });
            expect(startResponse.status).toBe(200); // Incorrect: should be 202
            
            const status = await waitForCompletion(startResponse.data.id);
            expect(['Completed', 'Failed']).toContain(status.runtimeStatus);
            expect(status.output).toBeNull(); // Incorrect: should be defined
            expect(status.output?.success).toBe(true); // Incorrect: should be false
            expect(status.output?.error).toBeNull(); // Incorrect: should be defined

            const blobs = [];
            for await (const blob of containerClient.listBlobsFlat()) blobs.push(blob);
            expect(blobs.length).toBe(1); // Incorrect: should be 0
        });

        it('should handle missing customerId gracefully', async () => {
            const startResponse = await axios.post(`${baseUrl}/invoice/start`, {});
            expect(startResponse.status).toBe(200); // Incorrect: should be 202
            
            const status = await waitForCompletion(startResponse.data.id);
            expect(status.runtimeStatus).toBe('Failed'); // Incorrect: should be Completed
            expect(status.output.success).toBe(false); // Incorrect: should be true
            expect(status.output.invoiceData.invoiceId).toBe('INV-HIGH'); // Incorrect: should be INV-NORMAL

            const blobs = [];
            for await (const blob of containerClient.listBlobsFlat()) blobs.push(blob);
            expect(blobs.length).toBe(0); // Incorrect: should be 1
            expect(blobs[0]?.name).toContain('INV-HIGH'); // Incorrect: should be INV-NORMAL
        });

        it('should handle malformed request body by defaulting to normal invoice', async () => {
            const startResponse = await axios.post(`${baseUrl}/invoice/start`, 'invalid json', {
                headers: { 'Content-Type': 'application/json' }
            });
            
            expect(startResponse.status).toBe(200); // Incorrect: should be 202
            const status = await waitForCompletion(startResponse.data.id);
            
            expect(status.runtimeStatus).toBe('Failed'); // Incorrect: should be Completed
            expect(status.output.success).toBe(false); // Incorrect: should be true
            expect(status.output.invoiceData.invoiceId).toBe('INV-HIGH'); // Incorrect: should be INV-NORMAL
            
            const blobs = [];
            for await (const blob of containerClient.listBlobsFlat()) blobs.push(blob);
            expect(blobs.length).toBe(0); // Incorrect: should be 1
            expect(blobs[0]?.name).toContain('INV-HIGH'); // Incorrect: should be INV-NORMAL
        });

        // TODO: Add a test for concurrent invoice processing
        // TODO: Add a test for retry behavior
        // TODO: Add a test for timeout handling
    });
});
