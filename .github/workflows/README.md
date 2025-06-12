# GitHub Actions Workflow for Azure Durable Functions

This document explains the GitHub Actions workflow setup for testing our Azure Durable Functions application.

## Workflow Overview

The workflow consists of two main jobs:
1. Unit Tests
2. Integration Tests

## Unit Tests Job

```yaml
unit-tests:
  name: Unit Tests
  runs-on: ubuntu-latest
```

### Steps:
1. **Checkout Code**
   ```yaml
   - uses: actions/checkout@v3
   ```

2. **Setup Node.js**
   ```yaml
   - name: Set up Node.js
     uses: actions/setup-node@v3
     with:
       node-version: '20'
       cache: 'npm'
   ```

3. **Install Dependencies**
   ```yaml
   - name: Install dependencies
     run: npm ci
   ```

4. **Run Unit Tests**
   ```yaml
   - name: Run unit tests
     run: npm test -- --testPathIgnorePatterns=integration
     env:
       NODE_ENV: 'test'
   ```

5. **Upload Test Results**
   ```yaml
   - name: Upload unit test results
     uses: actions/upload-artifact@v4
     with:
       name: unit-test-results
       path: |
         coverage/
         .jest-cache/
   ```

## Integration Tests Job

```yaml
integration-tests:
  name: Integration Tests
  needs: unit-tests
  runs-on: ubuntu-latest
```

### Services:
- **Azurite** (Azure Storage Emulator)
  ```yaml
  services:
    azurite:
      image: mcr.microsoft.com/azure-storage/azurite
      ports:
        - 10000:10000
        - 10001:10001
        - 10002:10002
  ```

### Steps:
1. **Checkout Code**
   ```yaml
   - uses: actions/checkout@v3
   ```

2. **Setup Node.js**
   ```yaml
   - name: Set up Node.js
     uses: actions/setup-node@v3
     with:
       node-version: '20'
       cache: 'npm'
   ```

3. **Install Azure Functions Core Tools**
   ```yaml
   - name: Install Azure Functions Core Tools
     run: npm install -g azure-functions-core-tools@4 --unsafe-perm true
   ```

4. **Install Dependencies**
   ```yaml
   - name: Install dependencies
     run: npm ci
   ```

5. **Wait for Azurite**
   ```yaml
   - name: Wait for Azurite to be ready
     run: |
       for i in {1..20}; do
         nc -z localhost 10000 && echo "Azurite is up!" && break
         echo "Waiting for Azurite..."
         sleep 2
       done
   ```

6. **Start Azure Functions Host**
   ```yaml
   - name: Start Azure Functions Host
     run: |
       # Create local.settings.json
       echo '{
         "IsEncrypted": false,
         "Values": {
           "AzureWebJobsStorage": "UseDevelopmentStorage=true",
           "FUNCTIONS_WORKER_RUNTIME": "node"
         }
       }' > local.settings.json
       
       # Start Functions host
       func start --no-build --port 7071 --node &
       
       # Wait for host to be ready
       for i in {1..30}; do
         if curl -s http://localhost:7071/api/health > /dev/null; then
           echo "Functions host is up!"
           break
         fi
         echo "Waiting for Functions host..."
         sleep 2
       done
   ```

7. **Run Integration Tests**
   ```yaml
   - name: Run integration tests
     run: npm test -- --testPathPattern=integration
     env:
       AzureWebJobsStorage: 'UseDevelopmentStorage=true'
       FUNCTIONS_WORKER_RUNTIME: 'node'
       NODE_ENV: 'test'
   ```

8. **Upload Test Results**
   ```yaml
   - name: Upload integration test results
     uses: actions/upload-artifact@v4
     with:
       name: integration-test-results
       path: |
         coverage/
         .jest-cache/
   ```

## Key Points

1. **Dependencies**
   - Node.js 20
   - Azure Functions Core Tools v4
   - Azurite (Azure Storage Emulator)

2. **Environment Variables**
   - `AzureWebJobsStorage`: Uses Azurite for local storage
   - `FUNCTIONS_WORKER_RUNTIME`: Set to "node"
   - `NODE_ENV`: Set to "test"

3. **Test Artifacts**
   - Coverage reports
   - Jest cache
   - Available for download after workflow completion

4. **Health Checks**
   - Waits for Azurite to be ready (port 10000)
   - Waits for Functions host to be ready (port 7071)
   - Maximum wait time: 60 seconds

## Troubleshooting

If the workflow fails, check:

1. **Azurite Connection**
   ```bash
   curl http://localhost:10000/devstoreaccount1
   ```

2. **Functions Host**
   ```bash
   curl http://localhost:7071/api/health
   ```

3. **Environment Variables**
   ```bash
   echo $AzureWebJobsStorage
   echo $FUNCTIONS_WORKER_RUNTIME
   ```

4. **Logs**
   - Check the Actions tab in GitHub
   - Look for error messages in the workflow steps
   - Download and examine test artifacts 