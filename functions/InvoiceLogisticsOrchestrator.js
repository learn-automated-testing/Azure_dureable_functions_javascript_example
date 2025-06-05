const { app } = require('@azure/functions');
const df = require('durable-functions');

df.app.orchestration('InvoiceLogisticsOrchestrator', function* (context) {
    const input = context.df.getInput();
    const results = {};

    // Step 1: Fetch the invoice
    results.fetchResult = yield context.df.callActivity('FetchInvoiceMock', input);
    if (!results.fetchResult.success) {
        throw new Error('Failed to fetch invoice');
    }

    // Step 2: Extract data
    results.extractResult = yield context.df.callActivity('ExtractInvoiceData', results.fetchResult);
    if (!results.extractResult.success) {
        throw new Error('Failed to extract invoice data');
    }

    // Step 3: Validate invoice
    results.validationResult = yield context.df.callActivity('ValidateInvoice', results.fetchResult);
    if (!results.validationResult.success) {
        throw new Error(`Invoice validation failed: ${results.validationResult.data.errors.join(', ')}`);
    }

    // Step 4: Route for approval if needed
    if (results.extractResult.data.requiresApproval) {
        results.routingResult = yield context.df.callActivity('RouteForApproval', results.extractResult);
        if (!results.routingResult.success) {
            throw new Error('Failed to route for approval');
        }
    }

    // Step 5: Archive the document
    results.archiveResult = yield context.df.callActivity('ArchiveDocument', results.fetchResult);
    if (!results.archiveResult.success) {
        throw new Error('Failed to archive document');
    }

    return {
        success: true,
        data: {
            invoiceId: results.fetchResult.data.invoiceId,
            processingSteps: results,
            completedAt: new Date().toISOString()
        }
    };
});

// HTTP trigger to start the orchestration
app.http('StartInvoiceProcessing', {
    route: 'orchestrators/invoice',
    extraInputs: [df.input.durableClient()],
    handler: async (request, context) => {
        const client = df.getClient(context);
        const body = await request.text();
        const instanceId = await client.startNew('InvoiceLogisticsOrchestrator', { input: body });

        context.log(`Started invoice processing orchestration with ID = '${instanceId}'.`);

        return client.createCheckStatusResponse(request, instanceId);
    },
}); 