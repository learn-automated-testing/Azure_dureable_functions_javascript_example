const { app } = require('@azure/functions');
const df = require('durable-functions');
const mockInvoice = require('../../mocks/mock-invoice.json');

// Activity to fetch the mock invoice
df.app.activity('FetchInvoice', {
    handler: async () => {
        // Simulate some processing time
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        return {
            success: true,
            data: mockInvoice,
            timestamp: new Date().toISOString()
        };
    }
});

// Activity to process the invoice
df.app.activity('ProcessInvoice', {
    handler: async (input) => {
        return {
            success: true,
            data: input,
            processedAt: new Date().toISOString()
        };
    }
});

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

        // Then process the invoice
        context.log('Calling ProcessInvoice activity');
        const processResult = yield context.df.callActivity('ProcessInvoice', fetchResult.data);
        context.log('ProcessInvoice result:', JSON.stringify(processResult, null, 2));
        
        context.log('Orchestrator completed successfully');
        return processResult;
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