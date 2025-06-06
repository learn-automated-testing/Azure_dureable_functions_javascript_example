const { app } = require('@azure/functions');
const df = require('durable-functions');
const mockInvoice = require('../../mocks/mock-invoice.json');
const PDFDocument = require('pdfkit');
const { BlobServiceClient } = require('@azure/storage-blob');

const path = require('path');
const fs = require('fs');

const FetchInvoice = {
    handler: async (input, context) => {
        let invoice;
        try {
            let mockFile;
            context.log('FetchInvoice handler started with input:', input);
            
            switch (input?.customerId) {
                case 1:
                    mockFile = 'mock-invoice-highvalue.json';
                    context.log('Selected high-value invoice mock');
                    break;
                case 2:
                    mockFile = 'mock-invoice-rejected.json';
                    context.log('Selected rejected invoice mock');
                    break;
                case 3:
                    mockFile = 'mock-invoice-invalid.json';
                    context.log('Selected invalid invoice mock');
                    break;
                default:
                    mockFile = 'mock-invoice.json';
                    context.log('Selected default invoice mock');
            }

            // Always resolve path relative to this file
            const mockPath = path.resolve(__dirname, '../mocks', mockFile);
            context.log('Loading mock file from path:', mockPath);

            // Read the JSON directly (using fs), so you can always handle file not found
            invoice = JSON.parse(fs.readFileSync(mockPath, 'utf8'));
            context.log('Successfully loaded mock invoice:', {
                invoiceId: invoice.invoiceId,
                vendorName: invoice.vendorName,
                totalAmount: invoice.totalAmount
            });
        } catch (err) {
            context.log('Error loading mock file:', err);
            // fallback: use the default mock (log the error if you want)
            const fallbackPath = path.resolve(__dirname, '../mocks', 'mock-invoice.json');
            context.log('Attempting to load fallback mock from:', fallbackPath);
            invoice = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
            context.log('Successfully loaded fallback mock invoice');
        }

        invoice = { ...invoice, ...input };
        context.log('Final invoice data after merging input:', {
            invoiceId: invoice.invoiceId,
            vendorName: invoice.vendorName,
            totalAmount: invoice.totalAmount,
            customerId: invoice.customerId
        });

        return {
            success: true,
            data: invoice,
            timestamp: new Date().toISOString()
        };
    }
};


// Activity: Generate PDF and store in Azure Storage
const GenerateAndStorePDF = {
    handler: async (input, context) => {
        try {
            // Validate input
            if (!input.invoiceId) {
                throw new Error('Invalid invoice: invoiceId is required');
            }
            if (!input.lineItems || !Array.isArray(input.lineItems) || input.lineItems.length === 0) {
                throw new Error('Invalid invoice: Missing line items');
            }
            // TODO (students): Validate that the sum of line item totals matches totalAmount

            // Create a new PDF document
            const doc = new PDFDocument();
            const chunks = [];

            const pdfPromise = new Promise((resolve, reject) => {
                doc.on('data', chunk => chunks.push(chunk));
                doc.on('end', () => resolve(Buffer.concat(chunks)));
                doc.on('error', reject);
            });
            
            // PDF content
            doc.fontSize(25).text('INVOICE', { align: 'center' });
            doc.moveDown();
            doc.fontSize(12)
                .text(`Invoice ID: ${input.invoiceId}`)
                .text(`Vendor: ${input.vendorName}`)
                .text(`Date: ${input.invoiceDate}`)
                .text(`Due Date: ${input.dueDate}`)
                .text(`Payment Terms: ${input.paymentTerms}`)
                .moveDown();

            doc.text('Shipping Address:')
                .text(`${input.shippingAddress.street}`)
                .text(`${input.shippingAddress.city}, ${input.shippingAddress.state} ${input.shippingAddress.zipCode}`)
                .text(input.shippingAddress.country)
                .moveDown();

            doc.text('Line Items:').moveDown();
            input.lineItems.forEach(item => {
                doc.text(`${item.description} - Quantity: ${item.quantity} - Unit Price: $${item.unitPrice} - Total: $${item.total}`);
            });

            doc.moveDown()
                .text(`Total Amount: $${input.totalAmount} ${input.currency}`, { align: 'right' });

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

const RequestManagerApproval = {
    handler: async (input, context) => {
        if (input.vendorName === 'Rejected Vendor') {
            return { approved: false, approvedBy: "manager@example.com", approvedAt: new Date().toISOString() };
        }
        return { approved: true, approvedBy: "manager@example.com", approvedAt: new Date().toISOString() };
    }
};

// Activity: (Optional) Notify by email stub
const NotifyByEmail = {
    handler: async (input, context) => {
        // TODO (students): Integrate real email or just log for test purposes
        context.log(`Pretend to send email to ${input.recipient} about invoice ${input.invoiceId}`);
        return { notified: true, recipient: input.recipient };
    }
};

// Register activities
df.app.activity('FetchInvoice', FetchInvoice);
df.app.activity('GenerateAndStorePDF', GenerateAndStorePDF);
df.app.activity('RequestManagerApproval', RequestManagerApproval);
df.app.activity('NotifyByEmail', NotifyByEmail);

df.app.orchestration('InvoiceOrchestrator', function* (context) {
    context.log('Orchestrator started');
    try {
        const invoiceInput = context.df.getInput();
        const fetchResult = yield context.df.callActivity('FetchInvoice', invoiceInput);
        let approvalResult = null;

        // Only require approval for high-value invoices (from the mock)
        if (fetchResult.data.totalAmount > 10000) {
            approvalResult = yield context.df.callActivity('RequestManagerApproval', fetchResult.data);
            if (!approvalResult || !approvalResult.approved) {
                return {
                    success: false,
                    reason: 'Not approved',
                    invoiceData: fetchResult.data,
                    approvalResult: approvalResult || { approved: false }
                };
            }
        }

        const pdfResult = yield context.df.callActivity('GenerateAndStorePDF', fetchResult.data);
        if (!pdfResult.success) {
            return {
                success: false,
                error: pdfResult.error,
                invoiceData: fetchResult.data,
                approvalResult: approvalResult || null,
                pdfDetails: pdfResult
            };
        }

        return {
            success: true,
            invoiceData: fetchResult.data,
            approvalResult: approvalResult || null,
            pdfDetails: pdfResult
        };
    } catch (error) {
        context.log('Error in orchestrator:', error);
        return {
            success: false,
            error: error.message
        };
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
            let body;
            try {
                body = await request.json();
            } catch (error) {
                context.log('Invalid JSON in request body:', error);
                return {
                    status: 400,
                    jsonBody: {
                        error: 'Invalid JSON in request body'
                    }
                };
            }
            
            context.log('Parsed request body:', body);
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

// HTTP trigger to check orchestrator status
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
    GenerateAndStorePDF,
    RequestManagerApproval,
    NotifyByEmail
};
