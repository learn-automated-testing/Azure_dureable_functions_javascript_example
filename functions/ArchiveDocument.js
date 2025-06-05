const { app } = require('@azure/functions');

app.activity('ArchiveDocument', {
    handler: async (input) => {
        const invoice = input.data;
        
        // Simulate archiving process
        const archiveRecord = {
            invoiceId: invoice.invoiceId,
            archivedAt: new Date().toISOString(),
            archiveLocation: `archive/${invoice.invoiceId}.json`,
            metadata: {
                vendorName: invoice.vendorName,
                totalAmount: invoice.totalAmount,
                currency: invoice.currency
            }
        };

        return {
            success: true,
            data: archiveRecord,
            timestamp: new Date().toISOString()
        };
    }
}); 