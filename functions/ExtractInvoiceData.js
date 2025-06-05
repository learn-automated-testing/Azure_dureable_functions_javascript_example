const { app } = require('@azure/functions');

app.activity('ExtractInvoiceData', {
    handler: async (input) => {
        const invoice = input.data;
        
        // Extract key information
        const extractedData = {
            invoiceId: invoice.invoiceId,
            vendorName: invoice.vendorName,
            totalAmount: invoice.totalAmount,
            currency: invoice.currency,
            dueDate: invoice.dueDate,
            lineItemCount: invoice.lineItems.length,
            requiresApproval: invoice.totalAmount > 1000
        };

        return {
            success: true,
            data: extractedData,
            timestamp: new Date().toISOString()
        };
    }
}); 