# TypeScript Coding Standards

## 🎯 Type Safety
- **No `any`**: Use `unknown` or specific interfaces/types instead.
- **Strict Null Checks**: Always handle `null` and `undefined`.
- **Explicit Returns**: Provide explicit return types for all public-facing functions.
- **Interface vs Type**: Use `interface` for structural definitions (classes, objects) and `type` for unions, aliases, and complex shapes.

## 🛠️ Performance
- **Immutability**: Prefer `ReadonlyArray` and `readonly` properties.
- **Lazy Loading**: Use dynamic imports for large modules or components.
- **Context Management**: Avoid deep context trees in React to prevent re-renders.

## 🧹 Maintainability
- **Small Components**: Keep files focused on a single responsibility.
- **DRY Logic**: Extract common logic into custom hooks or utility functions.
- **JSDoc**: Use JSDoc for complex logic or public APIs.

## 🛡️ Error Handling
- **Result Pattern**: Consider returning `Result<T, E>` objects for predictable error handling in complex flows.
- **Custom Errors**: Use specialized error classes for clearer debugging.
