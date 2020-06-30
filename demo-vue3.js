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
    // @todo 响应式去通知变化 触发执行，effect函数是响应式对象修改触发的
    trigger(target, key, info);
  },
};
// reactive() 函数接受一个普通对象 返回一个响应式数据对象
function reactive(target) {
  // 通过proxy将对象变为响应式
  const observed = new Proxy(target, baseHandler);
  //  返回proxy代理后的对象
  console.log(targetMap);
  return observed;
}

function computed(fn) {
  // 可以认为是特殊的 effect
  const runner = effect(fn, { computed: true, lazy: true });
  // 如果lazy不置为true的话，每次创建effect的时候都会立即执行一次
  return {
    effect: runner,
    get value() {
      return runner();
    },
  };
}
// 副作用函数，响应式对象的修改会触发
function effect(fn, options = {}) {
  // 依赖函数
  let e = createReactiveEffect(fn, options);
  // lazy是 computed配置的
  if (!options.lazy) {
    // 不是懒执行
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
      effectStack.pop(); // effect 执行完毕出栈
    }
  }
}
// 全局变量
// effect是副作用的意思，也就是说它是响应式副产品，每次触发了 get 时收集effect，每次set时在触发这些effects
// 这样就可以做一些响应式数据之外的一些事情了，比如计算属性computed。
let effectStack = []; // 存储effect

// 每个target被触发的时候，都可能有多个effect，所以每个target需要有一个对应的依赖收集器 deps，
// 等到 set 时遍历 deps 执行 effect()
// 然而，这个依赖收集器 deps 不能放在 target 本身上，这样会使数据看起来不是很简洁，还会存在多余无用的数据，
// 所以我们需要一个 map 集合来储存 target 跟 deps 的关系， 在vue中这个储存集合叫 targetMap
let targetMap = new WeakMap(); // 存储target

function track(target, key) {
  // 收集依赖, 将所有 get 的 target 跟 key 以及 effect 建立起对应关系
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
    // 没有依赖直接return
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
    // 拆开执行
    effects.forEach((effect) => effect());
    computedRunners.forEach((computed) => computed());
  }
}
