export function run(someOther, x) {
  someOther.async(() => x * 3);
}
