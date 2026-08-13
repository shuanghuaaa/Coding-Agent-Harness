#include <stdio.h>

/**
 * 递归计算阶乘 n!
 * 定义: 0! = 1, n! = n * (n-1)!
 *
 * @param n 非负整数
 * @return n 的阶乘
 */
long long factorial(int n) {
    // 基线条件 (base case): 0! = 1
    if (n == 0) return 1;
    // 递归条件: n! = n * (n-1)!
    return n * factorial(n - 1);
}

/**
 * 递归计算斐波那契数列第 n 项
 * 定义: F(0)=0, F(1)=1, F(n)=F(n-1)+F(n-2)
 */
long long fibonacci(int n) {
    if (n == 0) return 0;
    if (n == 1) return 1;
    return fibonacci(n - 1) + fibonacci(n - 2);
}

/**
 * 递归二分查找
 * @param arr 有序数组
 * @param low 左边界
 * @param high 右边界
 * @param target 目标值
 * @return 目标值索引，未找到返回 -1
 */
int binary_search(int arr[], int low, int high, int target) {
    if (low > high) return -1;                    // 基线: 没找到
    int mid = low + (high - low) / 2;
    if (arr[mid] == target) return mid;           // 基线: 找到了
    if (arr[mid] > target)
        return binary_search(arr, low, mid - 1, target);  // 去左边找
    else
        return binary_search(arr, mid + 1, high, target); // 去右边找
}

/* ========== 测试 ========== */
int main() {
    // 阶乘测试
    printf("### 阶乘 ###\n");
    for (int i = 0; i <= 10; i++) {
        printf("%d! = %lld\n", i, factorial(i));
    }

    // 斐波那契测试
    printf("\n### 斐波那契 ###\n");
    for (int i = 0; i <= 10; i++) {
        printf("F(%d) = %lld\n", i, fibonacci(i));
    }

    // 二分查找测试
    printf("\n### 二分查找 ###\n");
    int arr[] = {2, 5, 8, 12, 16, 23, 38, 56, 72, 91};
    int n = sizeof(arr) / sizeof(arr[0]);
    int targets[] = {23, 99};
    for (int i = 0; i < 2; i++) {
        int idx = binary_search(arr, 0, n - 1, targets[i]);
        if (idx != -1)
            printf("找到 %d，索引 = %d\n", targets[i], idx);
        else
            printf("%d 未找到\n", targets[i]);
    }

    return 0;
}