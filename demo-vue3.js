// Proxy 可以拦截所有操作
//     支持全部数据格式，Map
//     自带懒收集属性
//     浏览器自带能力

// defineProperty
//     初始化的时候全部递归完毕
//     数组需要单独拦截
//     对象新增和删除属性不能拦截，需要额外的$set

const baseHandler = {
  get(target, key) {
    // Reflect.get
    const res = Reflect.get(target, key);
    // @todo 依赖收集
    // 尝试获取值obj.age，触发getter
    track(target, key);
    return typeof res === "object" ? reactive(res) : res;
  },
  set(target, key, val) {
    const info = { oldValue: target[key], newValue: val };
    // Reflect.set
    // target[key] = val;
    const res = Reflect.set(target, key, val);
    // @todo 响应式去通知变化 触发执行effect
    trigger(target, key, info);
  },
};

function reactive(target) {
  const observed = new Proxy(target, baseHandler);
  //  返回proxy代理后的对象
  console.log(targetMap);
  return observed;
}

function computed(fn) {
  // 特殊的effect
  const runner = effect(fn, { computed: true, lazy: true });
  return {
    effect: runner,
    get value() {
      return runner();
    },
  };
}

function effect(fn, options = {}) {
  // 依赖函数
  let e = createReactiveEffect(fn, options);
  // lazy是 computed配置的
  if (!options.lazy) {
    e();
  }
  return e;
}

function createReactiveEffect(fn, options) {
  // 构造固定格式的 effect
  const effect = function effect(...args) {
    return run(effect, fn, args);
  };
  // effect的配置
  effect.deps = [];
  effect.computed = options.computed;
  effect.lazy = options.lazy;
  return effect;
}

function run(effect, fn, args) {
  // 取出effect 执行effect
  if (effectStack.indexOf(effect) === -1) {
    try {
      effectStack.push(effect);
      return fn(...args); // 执行effect
    } finally {
      effectStack.pop(); // effect 执行完毕
    }
  }
}
let effectStack = []; // 存储effect
let targetMap = new WeakMap();
function track(target, key) {
  // 收集依赖
  const effect = effectStack[effectStack.length - 1];
  if (effect) {
    let depMap = targetMap.get(target);
    if (depMap === undefined) {
      depMap = new Map();
      targetMap.set(target, depMap);
    }
    let dep = depMap.get(key);
    if (dep === undefined) {
      dep = new Set(); // key去重
      depMap.set(key, dep);
    }
    // 以上为容错 target key
    if (!dep.has(effect)) {
      // 新增依赖
      // 双向存储，方便查找优化
      dep.add(effect);
      effect.deps.push(dep);
    }
  }
}
//  收集依赖的方法，用一个巨大的map收集
// {
//     target1:{
//         key1:[包装之后的effect依赖的函数1，依赖的函数2]
//     }
//     target2:{
//         key2:[]
//     }
// }
function trigger(target, key, info) {
  // 数据变化后，通知更新，执行effect
  //1.找到依赖
  const depMap = targetMap.get(target);
  if (depMap === undefined) {
    return;
  }
  // 区分普通的effect和computed有优先级，effect先执行，computed后执行
  // 因为 computed 可能会依赖普通的 effect
  const effects = new Set();
  const computedRunners = new Set();
  if (key) {
    let deps = depMap.get(key);
    deps.forEach((effect) => {
      if (effect.computed) {
        computedRunners.add(effect);
      } else {
        effects.add(effect);
      }
    });
    effects.forEach((effect) => effect());
    computedRunners.forEach((computed) => computed());
  }
}
