const { app } = require('@azure/functions');

app.activity('RouteForApproval', {
    handler: async (input) => {
        const extractedData = input.data;
        
        // Simulate routing logic based on amount
        const approvalLevel = extractedData.totalAmount > 5000 ? 'Senior Manager' :
                            extractedData.totalAmount > 1000 ? 'Manager' :
                            'Team Lead';

        return {
            success: true,
            data: {
                approvalLevel,
                requiresApproval: extractedData.requiresApproval,
                routingTimestamp: new Date().toISOString()
            },
            timestamp: new Date().toISOString()
        };
    }
}); 