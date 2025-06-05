const { app } = require('@azure/functions');
const { validateAmount, validateDate } = require('../shared/invoice-utils');

app.activity('ValidateInvoice', {
    handler: async (input) => {
        const invoice = input.data;
        const validationResults = {
            isValid: true,
            errors: []
        };

        // Validate total amount
        if (!validateAmount(invoice.totalAmount)) {
            validationResults.isValid = false;
            validationResults.errors.push('Invalid total amount');
        }

        // Validate dates
        if (!validateDate(invoice.invoiceDate)) {
            validationResults.isValid = false;
            validationResults.errors.push('Invalid invoice date');
        }

        if (!validateDate(invoice.dueDate)) {
            validationResults.isValid = false;
            validationResults.errors.push('Invalid due date');
        }

        // Validate line items
        if (!invoice.lineItems || invoice.lineItems.length === 0) {
            validationResults.isValid = false;
            validationResults.errors.push('No line items found');
        }

        return {
            success: validationResults.isValid,
            data: validationResults,
            timestamp: new Date().toISOString()
        };
    }
}); 