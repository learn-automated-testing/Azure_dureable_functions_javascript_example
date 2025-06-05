const { app } = require('@azure/functions');
const mockInvoice = require('../mocks/mock-invoice.json');

app.activity('FetchInvoiceMock', {
    handler: async (input) => {
        // Simulate some processing time
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        return {
            success: true,
            data: mockInvoice,
            timestamp: new Date().toISOString()
        };
    }
}); 