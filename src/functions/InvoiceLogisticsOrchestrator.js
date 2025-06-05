const df = require('durable-functions');

df.app.orchestration('InvoiceLogisticsOrchestrator', function* (context) {
    const invoiceDocument = yield context.df.callActivity('FetchInvoiceMock');
    const extractedData = yield context.df.callActivity('ExtractInvoiceData', invoiceDocument);
    const validationResult = yield context.df.callActivity('ValidateInvoice', extractedData);
    let approvalResult = null;
    if (!validationResult.isValid || validationResult.needsApproval) {
        approvalResult = yield context.df.callActivity('RouteForApproval', extractedData);
    }
    const archiveResult = yield context.df.callActivity('ArchiveDocument', {
        ...extractedData,
        approval: approvalResult
    });
    return { extractedData, validationResult, approvalResult, archiveResult };
});