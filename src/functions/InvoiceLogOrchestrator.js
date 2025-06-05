const { app } = require('@azure/functions');
const df = require('durable-functions');
const mockInvoice = require('../../mocks/mock-invoice.json');
const PDFDocument = require('pdfkit');
const { BlobServiceClient } = require('@azure/storage-blob');

// Activity to fetch the mock invoice
const FetchInvoice = {
    handler: async (context) => {
        // Simulate some processing time
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        return {
            success: true,
            data: mockInvoice,
            timestamp: new Date().toISOString()
        };
    }
};

// Activity to generate PDF and store in Azure Storage
const GenerateAndStorePDF = {
    handler: async (input, context) => {
        try {
            // Create a new PDF document
            const doc = new PDFDocument();
            const chunks = [];

            if (!input.invoiceId) {
                throw new Error('Invalid invoice: invoiceId is required');
            }

            // Create a promise to collect all chunks
            const pdfPromise = new Promise((resolve, reject) => {
                doc.on('data', chunk => chunks.push(chunk));
                doc.on('end', () => resolve(Buffer.concat(chunks)));
                doc.on('error', reject);
            });
            
            // Add content to PDF
            doc.fontSize(25).text('INVOICE', { align: 'center' });
            doc.moveDown();
            
            // Add invoice details
            doc.fontSize(12)
                .text(`Invoice ID: ${input.invoiceId}`)
                .text(`Vendor: ${input.vendorName}`)
                .text(`Date: ${input.invoiceDate}`)
                .text(`Due Date: ${input.dueDate}`)
                .text(`Payment Terms: ${input.paymentTerms}`)
                .moveDown();

            // Add shipping address
            doc.text('Shipping Address:')
                .text(`${input.shippingAddress.street}`)
                .text(`${input.shippingAddress.city}, ${input.shippingAddress.state} ${input.shippingAddress.zipCode}`)
                .text(input.shippingAddress.country)
                .moveDown();

            // Add line items
            doc.text('Line Items:').moveDown();
            input.lineItems.forEach(item => {
                doc.text(`${item.description} - Quantity: ${item.quantity} - Unit Price: $${item.unitPrice} - Total: $${item.total}`);
            });
            
            // Add total
            doc.moveDown()
                .text(`Total Amount: $${input.totalAmount} ${input.currency}`, { align: 'right' });

            // Finalize PDF
            doc.end();

            // Wait for PDF to be generated
            const pdfBuffer = await pdfPromise;

            // Upload to Azure Storage
            const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AzureWebJobsStorage);
            const containerClient = blobServiceClient.getContainerClient('invoices');
            await containerClient.createIfNotExists();
            
            const blobName = `invoice-${input.invoiceId}-${new Date().toISOString()}.pdf`;
            const blockBlobClient = containerClient.getBlockBlobClient(blobName);
            
            await blockBlobClient.upload(pdfBuffer, pdfBuffer.length);

            return {
                success: true,
                blobName: blobName,
                blobUrl: blockBlobClient.url,
                processedAt: new Date().toISOString()
            };
        } catch (error) {
            console.error('Error generating PDF:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
};

// Register activities
df.app.activity('FetchInvoice', FetchInvoice);
df.app.activity('GenerateAndStorePDF', GenerateAndStorePDF);

// Orchestrator that coordinates the activities
df.app.orchestration('InvoiceOrchestrator', function* (context) {
    context.log('Orchestrator started');
    
    try {
        // First, fetch the invoice
        context.log('Calling FetchInvoice activity');
        const fetchResult = yield context.df.callActivity('FetchInvoice');
        context.log('FetchInvoice result:', JSON.stringify(fetchResult, null, 2));
        
        if (!fetchResult.success) {
            throw new Error('Failed to fetch invoice');
        }

        // Generate PDF and store in Azure Storage
        context.log('Generating and storing PDF');
        const pdfResult = yield context.df.callActivity('GenerateAndStorePDF', fetchResult.data);
        context.log('PDF generation result:', JSON.stringify(pdfResult, null, 2));

        if (!pdfResult.success) {
            throw new Error('Failed to generate and store PDF');
        }

        return {
            success: true,
            invoiceData: fetchResult.data,
            pdfDetails: pdfResult
        };
    } catch (error) {
        context.log('Error in orchestrator:', error);
        throw error;
    }
});

// HTTP trigger to start the orchestration
app.http('InvoiceHttpStart', {
    route: 'invoice/start',
    extraInputs: [df.input.durableClient()],
    handler: async (request, context) => {
        context.log('HTTP trigger received request');
        try {
            const client = df.getClient(context);
            const body = await request.text();
            context.log('Starting new orchestration instance');
            const instanceId = await client.startNew('InvoiceOrchestrator', { input: body });

            context.log(`Started invoice processing with ID = '${instanceId}'.`);

            // Return a simple response with the instance ID
            return {
                status: 202,
                jsonBody: {
                    id: instanceId,
                    status: "Running",
                    statusQueryGetUri: `/api/orchestrators/status/${instanceId}`
                }
            };
        } catch (error) {
            context.log('Error in HTTP trigger:', error);
            throw error;
        }
    },
});

app.http('GetInvoiceStatus', {
    route: 'orchestrators/status/{instanceId}',
    extraInputs: [df.input.durableClient()],
    handler: async (request, context) => {
        const client = df.getClient(context);
        const instanceId = request.params.instanceId;
        
        const status = await client.getStatus(instanceId);
        if (!status) {
            return {
                status: 404,
                jsonBody: {
                    error: `No invoice processing found with ID '${instanceId}'`
                }
            };
        }

        return {
            status: 200,
            jsonBody: status
        };
    },
});

// Export for testing
module.exports = {
    FetchInvoice,
    GenerateAndStorePDF
};